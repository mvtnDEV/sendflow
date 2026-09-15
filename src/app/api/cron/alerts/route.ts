export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { raiseAlert, autoResolveMissing } from "@/lib/services/alert.service";

const HORA = 60 * 60 * 1000;

function horasDesde(fecha: Date | null): number {
  if (!fecha) return 0;
  return Math.floor((Date.now() - new Date(fecha).getTime()) / HORA);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const ahora = Date.now();
  const select = {
    id: true,
    orderNumber: true,
    storeId: true,
    status: true,
    inTransitAt: true,
    receivedAt: true,
    createdAt: true,
    customerName: true,
    addressComuna: true,
    externalId: true,
    store: { select: { name: true } },
  };

  const resumen: Record<string, { levantadas: number; autoResueltas: number }> =
    {};

  try {
    // ── 1. STUCK_IN_TRANSIT: más de 24h en camino ──
    const trabados = await prisma.order.findMany({
      where: {
        status: "IN_TRANSIT",
        inTransitAt: { lt: new Date(ahora - 24 * HORA) },
      },
      select,
      take: 500,
    });

    for (const o of trabados) {
      await raiseAlert({
        type: "STUCK_IN_TRANSIT",
        orderId: o.id,
        orderNumber: o.orderNumber,
        storeId: o.storeId,
        title: `${o.orderNumber} lleva ${horasDesde(o.inTransitAt)} h en camino`,
        detail: `${o.store.name} · ${o.customerName} · ${o.addressComuna} · En camino desde hace más de 24 horas.`,
      });
    }

    resumen.STUCK_IN_TRANSIT = {
      levantadas: trabados.length,
      autoResueltas: await autoResolveMissing(
        "STUCK_IN_TRANSIT",
        trabados.map((o) => o.id),
      ),
    };

    // ── 2. STUCK_RECEIVED: más de 12h recepcionado sin avanzar ──
    const recepcionados = await prisma.order.findMany({
      where: {
        status: "RECEIVED",
        receivedAt: { lt: new Date(ahora - 12 * HORA) },
      },
      select,
      take: 500,
    });

    for (const o of recepcionados) {
      await raiseAlert({
        type: "STUCK_RECEIVED",
        orderId: o.id,
        orderNumber: o.orderNumber,
        storeId: o.storeId,
        title: `${o.orderNumber} lleva ${horasDesde(o.receivedAt)} h recepcionado`,
        detail: `${o.store.name} · ${o.customerName} · ${o.addressComuna} · Recepcionado pero sin poner en camino.`,
      });
    }

    resumen.STUCK_RECEIVED = {
      levantadas: recepcionados.length,
      autoResueltas: await autoResolveMissing(
        "STUCK_RECEIVED",
        recepcionados.map((o) => o.id),
      ),
    };

    // ── 3. DELIVERY_FAILED: pedidos en INCIDENT ──
    const noEntregados = await prisma.order.findMany({
      where: {
        status: "INCIDENT",
        createdAt: { gte: new Date(ahora - 7 * 24 * HORA) },
      },
      select,
      take: 500,
    });

    for (const o of noEntregados) {
      await raiseAlert({
        type: "DELIVERY_FAILED",
        orderId: o.id,
        orderNumber: o.orderNumber,
        storeId: o.storeId,
        title: `${o.orderNumber} no fue entregado`,
        detail: `${o.store.name} · ${o.customerName} · ${o.addressComuna} · Pedido marcado como no entregado.`,
      });
    }

    resumen.DELIVERY_FAILED = {
      levantadas: noEntregados.length,
      autoResueltas: await autoResolveMissing(
        "DELIVERY_FAILED",
        noEntregados.map((o) => o.id),
      ),
    };

    // ── 4. FLEX_CANCELLED: detectados por check-ml-shipped ──
    // No se barren acá, se levantan desde check-ml-shipped.
    // Solo auto-resolver las que ya no aplican.
    const flexCancelled = await prisma.alert.findMany({
      where: { type: "FLEX_CANCELLED", status: "ACTIVE" },
      select: { orderId: true },
    });
    const flexCancelledIds = flexCancelled
      .map((a) => a.orderId)
      .filter(Boolean) as string[];

    resumen.FLEX_CANCELLED = {
      levantadas: 0,
      autoResueltas:
        flexCancelledIds.length > 0
          ? await autoResolveMissing("FLEX_CANCELLED", flexCancelledIds)
          : 0,
    };

    console.log("[Cron Alertas] Terminado.", JSON.stringify(resumen));
    return NextResponse.json({ ok: true, resumen });
  } catch (err: any) {
    console.error("[Cron Alertas] ❌ Error:", err?.message);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Error inesperado" },
      { status: 500 },
    );
  }
}
