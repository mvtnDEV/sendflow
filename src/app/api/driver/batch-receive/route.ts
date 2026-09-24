export const dynamic = "force-dynamic";
export const maxDuration = 300;
import { NextRequest, NextResponse } from "next/server";
import { batchTransitionOrders } from "@/lib/services/order-batch.service";
import { enviarPedidosANow } from "@/lib/services/now-dispatch.service";

function verifyDriverToken(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const payload = JSON.parse(Buffer.from(auth.slice(7), "base64").toString());
    if (payload.exp < Date.now()) return null;
    if (payload.role !== "DRIVER") return null;
    return payload as { id: string; name: string; storeId: string | null };
  } catch {
    return null;
  }
}

// POST /api/driver/batch-receive — la app Moovex recepciona lo escaneado y lo manda a Now
export async function POST(req: NextRequest) {
  const driver = verifyDriverToken(req);
  if (!driver)
    return NextResponse.json(
      { ok: false, error: "No autorizado" },
      { status: 401 },
    );

  const { orderIds } = await req.json().catch(() => ({}));
  if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "orderIds requerido" },
      { status: 400 },
    );
  }

  try {
    // Flex a veces llega DELIVERED/INCIDENT antes de que bodega lo recepcione
    const result = await batchTransitionOrders({
      orderIds,
      toStatus: "RECEIVED",
      fromStatuses: ["PENDING", "INCIDENT", "DELIVERED"],
      eventNote: "Recepcionado en bodega vía escaneo batch",
      createdBy: driver.id,
      timestampField: "receivedAt",
    });

    // Todo lo escaneado va a Now (también los que ya estaban RECEIVED o tenían FR-)
    const now = await enviarPedidosANow(orderIds);

    return NextResponse.json({
      ok: true,
      updated: result.updated.length,
      enviadosNow: now.okIds.length,
      erroresNow: now.errores,
    });
  } catch (err) {
    console.error("[driver batch-receive] Error:", err);
    return NextResponse.json(
      { ok: false, error: "Error recepcionando pedidos" },
      { status: 500 },
    );
  }
}
