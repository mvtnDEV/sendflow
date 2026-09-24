export const dynamic = "force-dynamic";
export const maxDuration = 300;
import { NextRequest, NextResponse } from "next/server";
import { enviarPedidosANow } from "@/lib/services/now-dispatch.service";

// POST /api/debug/send-now — envío manual a Now de una lista de pedidos (packs agrupados)
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const key = req.nextUrl.searchParams.get("key");
  if (
    auth !== `Bearer ${process.env.CRON_SECRET}` &&
    key !== process.env.CRON_SECRET
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderIds } = await req.json().catch(() => ({}));
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json({ error: "orderIds requerido" }, { status: 400 });
  }

  const r = await enviarPedidosANow(orderIds);
  return NextResponse.json({ ok: true, total: orderIds.length, ...r });
}
