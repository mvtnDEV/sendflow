export const dynamic = "force-dynamic";
export const maxDuration = 300;
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/utils/auth";
import { batchTransitionOrders } from "@/lib/services/order-batch.service";
import { enviarPedidosANow } from "@/lib/services/now-dispatch.service";
import { deferAfterResponse } from "@/lib/utils/defer";

// POST /api/orders/batch-receive — recepcionar múltiples pedidos desde el panel web
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json(
      { ok: false, error: "No autorizado" },
      { status: 401 },
    );
  if (user.role === "VIEWER" || user.role === "DRIVER") {
    return NextResponse.json(
      { ok: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const { orderIds } = await req.json().catch(() => ({}));
  if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "orderIds requerido" },
      { status: 400 },
    );
  }

  try {
    const result = await batchTransitionOrders({
      orderIds,
      toStatus: "RECEIVED",
      fromStatuses: ["PENDING"],
      eventNote: "Recepcionado en bodega (batch web)",
      createdBy: user.id,
      restrictToStoreId:
        user.role === "STORE_ADMIN" && user.storeId ? user.storeId : undefined,
      timestampField: "receivedAt",
      reportMissing: true,
    });

    let enviadosNow = 0;
    let erroresNow: { orderNumber: string; error: string }[] = [];

    if (result.updated.length > 0) {
      const now = await enviarPedidosANow(result.updated.map((o) => o.id));
      enviadosNow = now.okIds.length;
      erroresNow = now.errores;

      const { notifyWebhooksBatch } =
        await import("@/lib/services/webhook.service");
      deferAfterResponse(
        notifyWebhooksBatch(
          result.updated.map((o) => ({
            orderId: o.id,
            storeId: o.storeId,
            previousStatus: o.previousStatus,
          })),
          "RECEIVED",
        ),
        "batch-receive webhooks",
      );
    }

    return NextResponse.json({
      ok: true,
      updated: result.updated.length,
      enviadosNow,
      erroresNow,
      errors: result.errors,
    });
  } catch (err: any) {
    console.error("[batch-receive] Error:", err);
    return NextResponse.json(
      { ok: false, error: "Error recepcionando pedidos" },
      { status: 500 },
    );
  }
}
