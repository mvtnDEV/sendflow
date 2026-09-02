import { prisma } from "@/lib/db/prisma";
import {
  generateOrderNumber,
  ensureUniqueQrCode,
} from "@/lib/utils/order-number";
import type { OrderFilters, NormalizedOrder, DashboardStats } from "@/types";
import type { OrderStatus, Platform } from "@prisma/client";

const REGIONES_PERMITIDAS = [
  "metropolitana",
  "región metropolitana",
  "region metropolitana",
  "rm",
  "metropolitana de santiago",
];

function isRegionPermitida(region: string): boolean {
  const r = region.toLowerCase().trim();
  return REGIONES_PERMITIDAS.some(
    (allowed) => r.includes(allowed) || allowed.includes(r),
  );
}

function todayRange() {
  const now = new Date();
  const santiagoParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = santiagoParts.find((p) => p.type === "year")!.value;
  const month = santiagoParts.find((p) => p.type === "month")!.value;
  const day = santiagoParts.find((p) => p.type === "day")!.value;
  const utcDate = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  const santiagoDate = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Santiago" }),
  );
  const offsetMs = santiagoDate.getTime() - utcDate.getTime();
  const offsetHours = offsetMs / (1000 * 60 * 60);
  const sign = offsetHours >= 0 ? "+" : "-";
  const absHours = Math.abs(offsetHours);
  const offsetStr = `${sign}${String(Math.floor(absHours)).padStart(2, "0")}:00`;
  return {
    gte: new Date(`${year}-${month}-${day}T00:00:00${offsetStr}`),
    lte: new Date(`${year}-${month}-${day}T23:59:59${offsetStr}`),
  };
}

interface CreateOrderInput {
  storeId: string;
  integrationId?: string;
  platform: Platform;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  addressStreet: string;
  addressComuna: string;
  addressRegion: string;
  addressNotes?: string;
  bultos: number;
  weightKg?: number;
  sourceId?: string;
  subStoreName?: string;
  rawPayload?: Record<string, unknown>;
  createdBy?: string;
}

// ── Tiendas que NO van a Fret automáticamente ──
const TIENDAS_EXCLUIDAS_FRET = new Set<string>([
  "cmpk7nslz0006r5e73du6f0kp", // Comercial Bess → Now
  "cmouw23l60003thpe1q7f16r3", // Oasis verde → Now
  "cmpbfadyd00032vgl7klna40b", // Fire Master → Now
  "cmpanvuns000053f2gbs46t83", // Senby → manual (Fret o Now según sub-tienda)
]);

export async function createOrder(input: CreateOrderInput) {
  if (!isRegionPermitida(input.addressRegion)) {
    throw new Error(
      `Pedido fuera de zona de despacho: ${input.addressRegion}. Solo despachamos en la Región Metropolitana.`,
    );
  }
  const [orderNumber, qrCode] = await Promise.all([
    generateOrderNumber(input.platform),
    ensureUniqueQrCode(input.platform),
  ]);

  const order = await prisma.order.create({
    data: {
      orderNumber,
      qrCode,
      storeId: input.storeId,
      integrationId: input.integrationId,
      platform: input.platform,
      sourceId: input.sourceId,
      subStoreName: input.subStoreName,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerEmail: input.customerEmail,
      addressStreet: input.addressStreet,
      addressComuna: input.addressComuna,
      addressRegion: input.addressRegion,
      addressNotes: input.addressNotes,
      bultos: input.bultos,
      weightKg: input.weightKg,
      rawPayload: input.rawPayload as any,
      status: "PENDING",
      events: {
        create: {
          status: "PENDING",
          note: "Pedido creado",
          createdBy: input.createdBy ?? "system",
        },
      },
    },
    include: {
      store: { select: { id: true, name: true, puntoRetiroFret: true } },
      events: true,
    },
  });

  // ── Decidir si enviar a Fret ──
  const enviarAFret = !TIENDAS_EXCLUIDAS_FRET.has(order.storeId);

  if (enviarAFret) {
    try {
      // ── Verificar si el pedido ya tiene externalId (ej: ID de Senby) ──
      const fresh = await prisma.order.findUnique({
        where: { id: order.id },
        select: { externalId: true },
      });
      const preservarExternalId = !!fresh?.externalId;

      // ── PACK GROUPING: si es ML y ya existe otra orden con el mismo ──
      // shipping_id, no reenviar a Fret (es el mismo paquete físico).
      const shippingId = (order.rawPayload as any)?.shipping?.id;

      if (order.platform === "MERCADOLIBRE" && shippingId) {
        const hermana = await prisma.order.findFirst({
          where: {
            id: { not: order.id },
            platform: "MERCADOLIBRE",
            rawPayload: {
              path: ["shipping", "id"],
              equals: Number(shippingId),
            },
          },
          select: { externalId: true, orderNumber: true },
        });

        if (hermana) {
          if (hermana.externalId?.startsWith("FR-") && !preservarExternalId) {
            await prisma.order.update({
              where: { id: order.id },
              data: { externalId: hermana.externalId },
            });
          }
          console.log(
            "[Fret] 📦 Pack agrupado:",
            order.orderNumber,
            "→ mismo envío que",
            hermana.orderNumber,
            hermana.externalId ? `(${hermana.externalId})` : "(FR- pendiente)",
            preservarExternalId
              ? `(externalId preservado: ${fresh?.externalId})`
              : "",
          );
          return order;
        }
      }

      const { toFretPayload, createFretOrders } =
        await import("./fret.service");
      const payload = toFretPayload({
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerEmail: order.customerEmail,
        addressStreet: order.addressStreet,
        addressComuna: order.addressComuna,
        addressNotes: order.addressNotes,
        bultos: order.bultos,
        qrCode: order.qrCode,
        sourceId: order.sourceId,
        platform: String(order.platform),
        puntoRetiroFret: (order.store as any).puntoRetiroFret ?? null,
        subStoreName: order.subStoreName,
        rawPayload: order.rawPayload,
      });

      const guardarFR = async (orderCode: string) => {
        if (!preservarExternalId) {
          await prisma.order.update({
            where: { id: order.id },
            data: { externalId: orderCode },
          });
        }
      };

      const result = await createFretOrders([payload]);

      if (result.ok && result.created[0]) {
        await guardarFR(result.created[0].order_code);
        console.log(
          "[Fret] ✅ Pedido creado:",
          order.orderNumber,
          "→",
          result.created[0].order_code,
          preservarExternalId
            ? `(externalId preservado: ${fresh?.externalId})`
            : "",
        );
      } else if (result.duplicated[0]) {
        await guardarFR(result.duplicated[0].order_code);
        console.log(
          "[Fret] Duplicado:",
          order.orderNumber,
          "→",
          result.duplicated[0].order_code,
          preservarExternalId
            ? `(externalId preservado: ${fresh?.externalId})`
            : "",
        );
      } else if (result.rejected?.[0]) {
        console.warn(
          "[Fret] ❌ Rechazado:",
          order.orderNumber,
          "| campo:",
          result.rejected[0].field,
          "| detalle:",
          result.rejected[0].detail,
        );
      } else if (result.error) {
        console.warn(
          "[Fret] ⚠️ Error, reintentando en 2s:",
          order.orderNumber,
          result.error,
        );
        await new Promise((r) => setTimeout(r, 2000));
        const retry = await createFretOrders([payload]);
        if (retry.ok && retry.created[0]) {
          await guardarFR(retry.created[0].order_code);
          console.log(
            "[Fret] ✅ Pedido creado (reintento):",
            order.orderNumber,
            "→",
            retry.created[0].order_code,
          );
        } else if (retry.duplicated[0]) {
          await guardarFR(retry.duplicated[0].order_code);
          console.log(
            "[Fret] Duplicado (reintento):",
            order.orderNumber,
            "→",
            retry.duplicated[0].order_code,
          );
        } else {
          console.error(
            "[Fret] ❌ Falló después de reintento:",
            order.orderNumber,
            retry.error ?? retry.rejected?.[0]?.detail,
          );
        }
      }
    } catch (err) {
      console.error("[Fret] Error enviando a Fret:", err);
    }
  }

  return order;
}

export async function upsertOrderFromWebhook(
  storeId: string,
  integrationId: string,
  data: NormalizedOrder,
) {
  const existing = await prisma.order.findFirst({
    where: { integrationId, sourceId: data.externalId },
    select: { id: true },
  });
  if (existing) {
    return prisma.order.update({
      where: { id: existing.id },
      data: {
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail,
        addressStreet: data.addressStreet,
        addressComuna: data.addressComuna,
        addressRegion: data.addressRegion,
        rawPayload: data.rawPayload as any,
      },
    });
  }
  return createOrder({
    storeId,
    integrationId,
    platform: data.platform,
    sourceId: data.externalId,
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    customerEmail: data.customerEmail,
    addressStreet: data.addressStreet,
    addressComuna: data.addressComuna,
    addressRegion: data.addressRegion,
    bultos: data.bultos,
    rawPayload: data.rawPayload as any,
    createdBy: "webhook",
  });
}

const STATUS_TIMESTAMP: Partial<Record<OrderStatus, string>> = {
  RECEIVED: "receivedAt",
  DISPATCHED: "inTransitAt",
  PICKED_UP: "receivedAt",
  IN_TRANSIT: "inTransitAt",
  DELIVERED: "deliveredAt",
};

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  note?: string,
  createdBy?: string,
  skipEnviosNow?: boolean,
) {
  const timestampField = STATUS_TIMESTAMP[status];
  const previous = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  const previousStatus = previous?.status ?? "PENDING";
  const order = await prisma.order.update({
    where: { id: orderId },
    data: {
      status,
      ...(timestampField ? { [timestampField]: new Date() } : {}),
      events: {
        create: {
          status,
          note: note ?? `Estado actualizado a ${status}`,
          createdBy: createdBy ?? "system",
        },
      },
    },
  });
  try {
    const { notifyWebhooks } = await import("./webhook.service");
    const { deferAfterResponse } = await import("@/lib/utils/defer");
    deferAfterResponse(
      notifyWebhooks(orderId, status, previousStatus),
      "updateOrderStatus webhook",
    );
  } catch (err) {
    console.error("[Webhook] Error:", err);
  }
  return order;
}

export async function findOrderByQr(qrCode: string) {
  return prisma.order.findUnique({
    where: { qrCode },
    include: {
      store: { select: { id: true, name: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function listOrders(filters: OrderFilters) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;
  const skip = (page - 1) * pageSize;
  const today = todayRange();
  const where: any = {};
  if (filters.storeId) where.storeId = filters.storeId;
  if (filters.status) where.status = filters.status;
  if (filters.platform) where.platform = filters.platform;
  if (filters.comuna)
    where.addressComuna = { contains: filters.comuna, mode: "insensitive" };
  if (filters.search) {
    where.OR = [
      { customerName: { contains: filters.search, mode: "insensitive" } },
      { addressStreet: { contains: filters.search, mode: "insensitive" } },
      { orderNumber: { contains: filters.search, mode: "insensitive" } },
      { customerPhone: { contains: filters.search } },
      { sourceId: { contains: filters.search } },
      { subStoreName: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  if (filters.todayOnly && !filters.dateFrom && !filters.dateTo) {
    if (filters.superAdminView) {
      where.AND = [
        {
          OR: [
            { inTransitAt: today },
            { status: "IN_TRANSIT" },
            { status: "DISPATCHED" },
            { status: "PICKED_UP" },
            { status: "RECEIVED" },
            { status: "PENDING", createdAt: today },
            { deliveredAt: today },
            { status: "INCIDENT", inTransitAt: today },
          ],
        },
      ];
    } else {
      where.AND = [
        {
          OR: [
            { inTransitAt: today },
            { deliveredAt: today },
            { status: "PENDING", createdAt: today },
            { status: "RECEIVED", createdAt: today },
            { status: "RECEIVED" },
            { status: "DISPATCHED", createdAt: today },
            { status: "PICKED_UP", createdAt: today },
            { status: "IN_TRANSIT" },
            { status: "INCIDENT", inTransitAt: today },
          ],
        },
      ];
    }
  } else if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
      ...(filters.dateTo && { lte: new Date(filters.dateTo + "T23:59:59") }),
    };
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        platform: true,
        status: true,
        customerName: true,
        customerPhone: true,
        addressStreet: true,
        addressComuna: true,
        bultos: true,
        sourceId: true,
        subStoreName: true,
        createdAt: true,
        evidencePhoto1: true,
        labelUrl: true,
        mlShippedAt: true,
        rawPayload: true,
        store: { select: { id: true, name: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getDashboardStats(
  storeId?: string,
  todayOnly = true,
): Promise<DashboardStats> {
  const today = todayRange();
  const baseWhere: any = {};
  if (storeId) baseWhere.storeId = storeId;
  if (todayOnly) {
    baseWhere.AND = [
      {
        OR: [
          { inTransitAt: today },
          { deliveredAt: today },
          { status: "IN_TRANSIT" },
          { status: "DISPATCHED" },
          { status: "PICKED_UP" },
          { status: "RECEIVED" },
          { status: "PENDING", createdAt: today },
        ],
      },
    ];
  }

  const [byStatus, byPlatform, byStore] = await Promise.all([
    prisma.order.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["platform"],
      where: baseWhere,
      _count: { _all: true },
    }),
    storeId
      ? []
      : prisma.order.groupBy({
          by: ["storeId"],
          where: baseWhere,
          _count: { _all: true },
          orderBy: { _count: { storeId: "desc" } },
          take: 5,
        }),
  ]);
  const countMap: Record<string, number> = {};
  byStatus.forEach((s) => {
    countMap[s.status] = s._count._all;
  });
  const total = Object.values(countMap).reduce((a, b) => a + b, 0);
  let byStoreWithNames: DashboardStats["byStore"] = [];
  if (!storeId && byStore.length > 0) {
    const stores = await prisma.store.findMany({
      where: { id: { in: (byStore as any[]).map((s: any) => s.storeId) } },
      select: { id: true, name: true },
    });
    const storeMap = Object.fromEntries(stores.map((s) => [s.id, s.name]));
    byStoreWithNames = (byStore as any[]).map((s: any) => ({
      storeId: s.storeId,
      storeName: storeMap[s.storeId] ?? "Desconocida",
      count: s._count._all,
    }));
  }
  return {
    total,
    pending: countMap["PENDING"] ?? 0,
    received: countMap["RECEIVED"] ?? 0,
    dispatched: countMap["DISPATCHED"] ?? 0,
    pickedUp: countMap["PICKED_UP"] ?? 0,
    inTransit: countMap["IN_TRANSIT"] ?? 0,
    delivered: countMap["DELIVERED"] ?? 0,
    incident: countMap["INCIDENT"] ?? 0,
    byPlatform: byPlatform.map((p) => ({
      platform: p.platform,
      count: p._count._all,
    })),
    byStore: byStoreWithNames,
  };
}
