export const dynamic = "force-dynamic";
export const maxDuration = 300;
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/utils/auth";
import { createOrder, todayRange } from "@/lib/services/order.service";
import { audit } from "@/lib/services/audit.service";
import { despachoAutomaticoNow } from "@/lib/services/now-dispatch.service";
import { TIENDAS_AUTO_NOW } from "@/lib/config/operadores";
import { prisma } from "@/lib/db/prisma";
import type { Platform } from "@prisma/client";

// Un pedido manual con el mismo cliente, dirección y comuna en la misma tienda
// se considera carga repetida solo si es del MISMO DÍA (hora de Chile). Un pedido
// de otro día nunca se bloquea, sin importar la hora a la que se cargue.

const normaliza = (s: unknown) => String(s ?? "").trim().toLowerCase();
const claveFila = (row: any) =>
  [row.storeId, row.customerName, row.addressStreet, row.addressComuna]
    .map(normaliza)
    .join("|");

// POST /api/orders/bulk — multi-tienda
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json(
      { ok: false, error: "No autorizado" },
      { status: 401 },
    );
  if (user.role === "VIEWER")
    return NextResponse.json(
      { ok: false, error: "Sin permisos" },
      { status: 403 },
    );

  const { platform, rows, allowDuplicates } = await req.json().catch(() => ({}));
  if (!rows?.length)
    return NextResponse.json(
      { ok: false, error: "rows requerido" },
      { status: 400 },
    );

  let created = 0;
  const errors: string[] = [];
  // Índices (dentro de `rows`) de filas omitidas por ser repetidas
  const skipped: number[] = [];
  const vistasEnEsteArchivo = new Set<string>();
  const autoNowIds: string[] = []; // pedidos de tiendas con despacho automático (Senby)

  for (const [idx, row] of (rows as any[]).entries()) {
    // Cada fila trae su propio storeId resuelto desde el frontend
    if (!row.storeId) {
      errors.push(
        `Fila sin tienda asignada: ${row.customerName || "(sin nombre)"}`,
      );
      continue;
    }
    if (!row.customerName || !row.addressStreet || !row.addressComuna) {
      errors.push(
        `Fila sin datos requeridos: ${row.customerName || "(sin nombre)"}`,
      );
      continue;
    }

    // STORE_ADMIN solo puede crear pedidos en su tienda
    if (user.role === "STORE_ADMIN" && user.storeId !== row.storeId) {
      errors.push(`Sin acceso a tienda: ${row.storeName || row.storeId}`);
      continue;
    }

    // ── Anti-duplicado: misma tienda + cliente + dirección + comuna ──
    // (del mismo día o repetida dentro del mismo archivo). Se omite y se
    // informa; el usuario puede forzarla con allowDuplicates si es un pedido distinto.
    if (!allowDuplicates) {
      const clave = claveFila(row);
      let repetida = vistasEnEsteArchivo.has(clave);
      if (!repetida) {
        try {
          const previo = await prisma.order.findFirst({
            where: {
              storeId: row.storeId,
              platform: (platform || "MANUAL") as Platform,
              status: { not: "CANCELLED" },
              createdAt: { gte: todayRange().gte },
              customerName: { equals: String(row.customerName).trim(), mode: "insensitive" },
              addressStreet: { equals: String(row.addressStreet).trim(), mode: "insensitive" },
              addressComuna: { equals: String(row.addressComuna).trim(), mode: "insensitive" },
            },
            select: { id: true },
          });
          repetida = !!previo;
        } catch (e) {
          // Si la verificación falla, no bloquear la operación: se crea el pedido.
          console.error("[bulk] Error verificando duplicado:", e);
        }
      }
      if (repetida) {
        skipped.push(idx);
        continue;
      }
      vistasEnEsteArchivo.add(clave);
    }

    try {
      const order = await createOrder({
        storeId: row.storeId,
        platform: (platform || "MANUAL") as Platform,
        customerName: row.customerName,
        customerPhone: row.customerPhone || "",
        customerEmail: row.customerEmail || "",
        addressStreet: row.addressStreet,
        addressComuna: row.addressComuna,
        addressRegion: row.addressRegion || "Metropolitana",
        addressNotes: row.addressNotes || "",
        bultos: Number(row.bultos) || 1,
        weightKg: Number(row.weightKg) || undefined,
        createdBy: user.id,
      });
      created++;
      if (TIENDAS_AUTO_NOW.has(row.storeId)) autoNowIds.push(order.id);
    } catch (e: any) {
      errors.push(`${row.customerName}: ${e.message}`);
    }
  }

  // ── Despacho automático (Senby): RECEIVED → Now → IN_TRANSIT ──
  let autoNow: {
    recepcionados: number;
    enCamino: number;
    errores: { orderNumber: string; error: string }[];
  } | null = null;
  if (autoNowIds.length > 0) {
    try {
      autoNow = await despachoAutomaticoNow(autoNowIds, user.id);
      for (const e of autoNow.errores)
        errors.push(
          `${e.orderNumber}: Now rechazó (${e.error}) — quedó recepcionado`,
        );
    } catch (e: any) {
      console.error("[bulk] Error en despacho automático:", e);
      errors.push(`Despacho automático falló: ${e.message}`);
    }
  }

  await audit({
    userId: user.id,
    action: "CREATE_ORDER",
    resource: "bulk",
    metadata: {
      type: "bulk_multistore",
      created,
      skipped: skipped.length,
      errors: errors.length,
    } as any,
  });

  return NextResponse.json({ ok: true, data: { created, errors, skipped, autoNow } });
}
