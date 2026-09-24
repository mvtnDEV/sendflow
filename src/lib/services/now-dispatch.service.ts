import { prisma } from "@/lib/db/prisma";
import {
  toEnviosNowPayload,
  createEnviosNowDelivery,
} from "@/lib/services/enviosnow.service";
import { batchTransitionOrders } from "@/lib/services/order-batch.service";
import { deferAfterResponse } from "@/lib/utils/defer";
import {
  TIENDAS_FRET_ACTIVAS,
  TIENDAS_PRESERVAN_EXTERNAL_ID,
} from "@/lib/config/operadores";

export interface ResultadoNow {
  /** Cantidad de envíos creados en Now (un pack cuenta como 1). */
  envios: number;
  /** IDs de pedidos que quedaron cargados en Now (incluye todas las ventas de un pack y duplicados). */
  okIds: string[];
  /** Pedidos que Now rechazó o fallaron. */
  errores: { orderNumber: string; error: string }[];
  /** Pedidos que no se mandaron porque su tienda sigue con Fret. */
  omitidos: number;
}

/**
 * Envía pedidos a Envios Now.
 *  - Packs de ML (mismo shipping_id): se manda UN solo envío y el ID se
 *    propaga a todas las ventas del pack.
 *  - Tiendas que preservan externalId (Senby): no se pisa su ID.
 *  - Si Now responde "duplicado" se considera OK (ya estaba cargado).
 */
export async function enviarPedidosANow(
  orderIds: string[],
): Promise<ResultadoNow> {
  const res: ResultadoNow = { envios: 0, okIds: [], errores: [], omitidos: 0 };
  if (orderIds.length === 0) return res;

  const pedidos = await prisma.order.findMany({
    where: { id: { in: [...new Set(orderIds)] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      orderNumber: true,
      storeId: true,
      platform: true,
      externalId: true,
      rawPayload: true,
      customerName: true,
      customerPhone: true,
      addressStreet: true,
      addressComuna: true,
      createdAt: true,
    },
  });

  // ── Agrupar: packs ML por shipping_id, el resto uno por uno ──
  const grupos = new Map<string, typeof pedidos>();
  for (const p of pedidos) {
    if (TIENDAS_FRET_ACTIVAS.has(p.storeId)) {
      res.omitidos++;
      continue;
    }
    const shippingId = (p.rawPayload as any)?.shipping?.id;
    const key =
      p.platform === "MERCADOLIBRE" && shippingId
        ? `ml:${shippingId}`
        : `id:${p.id}`;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key)!.push(p);
  }

  const { mapWithConcurrency } = await import("@/lib/utils/concurrency");

  await mapWithConcurrency([...grupos.values()], 6, async (grupo) => {
    const principal = grupo[0]; // el más antiguo del pack
    try {
      const r = await createEnviosNowDelivery(toEnviosNowPayload(principal));

      if (!r.ok) {
        res.errores.push({
          orderNumber: principal.orderNumber,
          error: r.error ?? "Error Now",
        });
        console.warn("[Now] Rechazado:", principal.orderNumber, r.error);
        return;
      }

      grupo.forEach((g) => res.okIds.push(g.id));

      if (r.id && r.id !== "duplicate") {
        res.envios++;
        const nowId = String(r.id);
        const aActualizar = grupo
          .filter((g) => !TIENDAS_PRESERVAN_EXTERNAL_ID.has(g.storeId))
          .map((g) => g.id);
        if (aActualizar.length > 0) {
          await prisma.order.updateMany({
            where: { id: { in: aActualizar } },
            data: { externalId: nowId },
          });
        }
        console.log(
          "[Now] ✅",
          principal.orderNumber,
          "→",
          nowId,
          grupo.length > 1 ? `(pack de ${grupo.length} ventas)` : "",
        );
      } else {
        console.log("[Now] Ya existía en Now:", principal.orderNumber);
      }
    } catch (err: any) {
      res.errores.push({
        orderNumber: principal.orderNumber,
        error: err.message,
      });
      console.error("[Now] Error:", principal.orderNumber, err.message);
    }
  });

  console.log(
    `[Now] Resumen: ${res.envios} envíos creados · ${res.okIds.length} pedidos OK · ${res.errores.length} errores · ${res.omitidos} omitidos (Fret)`,
  );
  return res;
}

/**
 * Despacho automático (Senby):
 * PENDING → RECEIVED → se envía a Now → IN_TRANSIT → aviso a la tienda por webhook.
 * Los que Now rechace quedan en RECEIVED para reenviarlos a mano.
 */
export async function despachoAutomaticoNow(
  orderIds: string[],
  createdBy: string,
) {
  if (orderIds.length === 0)
    return {
      recepcionados: 0,
      enCamino: 0,
      errores: [] as ResultadoNow["errores"],
    };

  // 1. Recepcionar
  const recep = await batchTransitionOrders({
    orderIds,
    toStatus: "RECEIVED",
    fromStatuses: ["PENDING"],
    eventNote: "Recepción automática",
    createdBy,
    timestampField: "receivedAt",
  });
  const recibidos = recep.updated.map((o) => o.id);

  // 2. Enviar a Now
  const now = await enviarPedidosANow(recibidos);

  // 3. Poner en camino solo los que quedaron cargados en Now
  let enCamino = 0;
  if (now.okIds.length > 0) {
    const ruta = await batchTransitionOrders({
      orderIds: now.okIds,
      toStatus: "IN_TRANSIT",
      fromStatuses: ["RECEIVED"],
      eventNote: "En camino (automático tras enviar a Envios Now)",
      createdBy,
      timestampField: "inTransitAt",
    });
    enCamino = ruta.updated.length;

    // 4. Avisar a la tienda (Senby) que va en camino — sin bloquear la respuesta
    if (ruta.updated.length > 0) {
      const { notifyWebhooksBatch } =
        await import("@/lib/services/webhook.service");
      deferAfterResponse(
        notifyWebhooksBatch(
          ruta.updated.map((o) => ({
            orderId: o.id,
            storeId: o.storeId,
            previousStatus: "RECEIVED",
          })),
          "IN_TRANSIT",
        ),
        "despacho-automatico webhooks",
      );
    }
  }

  console.log(
    `[Auto Now] ${recibidos.length} recepcionados · ${enCamino} en camino · ${now.errores.length} errores`,
  );
  return { recepcionados: recibidos.length, enCamino, errores: now.errores };
}
