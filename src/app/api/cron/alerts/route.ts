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
    inTransitAt: true,
    store: { select: { name: true } },
  };

  const resumen: Record<string, { levantadas: number; autoResueltas: number }> =
    {};

  try {
    // ── STUCK_IN_TRANSIT: más de 24 h "en camino" ──────────────────────────
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
        detail: `${o.store.name} · En camino desde hace más de 24 horas sin cerrar.`,
        metadata: { inTransitAt: o.inTransitAt },
      });
    }

    resumen.STUCK_IN_TRANSIT = {
      levantadas: trabados.length,
      autoResueltas: await autoResolveMissing(
        "STUCK_IN_TRANSIT",
        trabados.map((o) => o.id),
      ),
    };

    // FLEX_CANCELLED no se barre acá: la levanta check-ml-shipped y su cierre
    // es una decisión humana, no se auto-resuelve.

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
