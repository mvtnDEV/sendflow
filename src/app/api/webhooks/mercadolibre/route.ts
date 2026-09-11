export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decrypt } from "@/lib/utils/crypto";

const TIENDAS_FRET = new Set([
  "cmouw44ej0004thpecq6bct35", // eco pañal
  "cmouw23l60003thpe1q7f16r3", // oasis verde
  "cmpbfadyd00032vgl7klna40b", // fire master
  "cmpk7nslz0006r5e73du6f0kp", // comercial bess
  "cmovurlze000018duer7sffp4", // protec
  "cmt2181g800072mm41q6pfsb9", // sigan jugando
]);

export async function POST(req: NextRequest) {
  const body = await req.json();
  console.log("[ML webhook] body:", JSON.stringify(body).slice(0, 300));

  const topic = body.topic;
  const resource = body.resource;
  const userId = body.user_id;

  if (topic !== "orders_v2" || !resource) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const orderId = resource.replace("/orders/", "");

  const integration = await prisma.storeIntegration.findFirst({
    where: {
      platform: "MERCADOLIBRE",
      externalStoreId: String(userId),
      isActive: true,
    },
    select: {
      id: true,
      storeId: true,
      apiKeyEnc: true,
      store: { select: { name: true, puntoRetiroFret: true } },
    },
  });

  if (!integration) {
    console.log("[ML webhook] Integración no encontrada para user:", userId);
    return NextResponse.json({ ok: true, no_integration: true });
  }

  // ── Desencriptar token ──
  let token: string;
  try {
    token = decrypt(integration.apiKeyEnc);
  } catch {
    token = integration.apiKeyEnc;
    console.warn("[ML webhook] No se pudo desencriptar token, usando directo");
  }

  try {
    const mlRes = await fetch(
      `https://api.mercadolibre.com/orders/${orderId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!mlRes.ok) {
      console.error(
        "[ML webhook] Error ML API:",
        mlRes.status,
        "| tienda:",
        integration.store?.name,
      );
      return NextResponse.json({ ok: true, ml_error: mlRes.status });
    }

    const mlOrder = await mlRes.json();
    const shippingId = mlOrder.shipping?.id;

    let shipment: any = null;
    if (shippingId) {
      try {
        const shipRes = await fetch(
          `https://api.mercadolibre.com/shipments/${shippingId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (shipRes.ok) shipment = await shipRes.json();
      } catch {}
    }

    const shipmentStatus = shipment?.status ?? "unknown";
    const shipmentSubstatus = shipment?.substatus ?? "unknown";
    console.log(
      "[ML webhook] Shipment status:",
      shipmentStatus,
      "| substatus:",
      shipmentSubstatus,
    );

    const existing = await prisma.order.findFirst({
      where: { integrationId: integration.id, sourceId: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        storeId: true,
        externalId: true,
        rawPayload: true,
      },
    });

    if (existing) {
      if (shipmentStatus === "delivered" && existing.status !== "DELIVERED") {
        const deliveredDate =
          shipment?.status_history?.date_delivered ?? new Date().toISOString();

        await prisma.order.update({
          where: { id: existing.id },
          data: {
            status: "DELIVERED",
            deliveredAt: new Date(deliveredDate),
            mlShippedAt: new Date(),
            events: {
              create: {
                status: "DELIVERED",
                note: "Entrega confirmada por Moovex (Flex)",
                createdBy: "ml-webhook",
              },
            },
          },
        });

        if (
          TIENDAS_FRET.has(existing.storeId) ||
          existing.externalId?.startsWith("FR-")
        ) {
          try {
            const { notificarEntregaAFret } =
              await import("@/lib/services/fret.service");
            await notificarEntregaAFret({
              referencia: existing.orderNumber.replace("#", ""),
              shipmentId: shippingId ? String(shippingId) : null,
              fecha: deliveredDate,
            });
            console.log(
              "[ML webhook] ✅ Notificado a Fret:",
              existing.orderNumber,
            );
          } catch (err) {
            console.error(
              "[ML webhook] Error notificando a Fret:",
              existing.orderNumber,
              err,
            );
          }
        }

        try {
          const { notifyWebhooks } =
            await import("@/lib/services/webhook.service");
          await notifyWebhooks(existing.id, "DELIVERED", existing.status);
        } catch {}

        console.log("[ML webhook] ✅ Cerrado por Flex:", existing.orderNumber);
        return NextResponse.json({ ok: true, closed_by_flex: true });
      }

      if (
        shipmentStatus === "shipped" &&
        shipmentSubstatus !== "creating_route" &&
        shipmentSubstatus !== "ready_to_print"
      ) {
        await prisma.order.update({
          where: { id: existing.id },
          data: { mlShippedAt: new Date() },
        });
      }

      const esTiendaFret =
        TIENDAS_FRET.has(existing.storeId) ||
        existing.externalId?.startsWith("FR-");
      console.log(
        "[ML webhook]",
        esTiendaFret ? "Tienda Fret" : "Tienda Now",
        "· solo escaneo registrado (Flex no delivered):",
        orderId,
      );
      return NextResponse.json({ ok: true, updated: true });
    }

    if (
      shipmentStatus === "cancelled" ||
      shipmentSubstatus === "cancelled" ||
      mlOrder.status === "cancelled"
    ) {
      console.log("[ML webhook] Pedido cancelado, ignorando:", orderId);
      return NextResponse.json({ ok: true, cancelled: true });
    }

    let addressStreet = "Sin dirección";
    let addressComuna = "Sin comuna";
    let addressRegion = "Región Metropolitana";
    let addressNotes = "";

    if (shipment?.receiver_address) {
      const addr = shipment.receiver_address;
      addressStreet = [addr.street_name, addr.street_number]
        .filter(Boolean)
        .join(" ");
      addressComuna =
        addr.city?.name ?? addr.municipality?.name ?? "Sin comuna";
      addressRegion = addr.state?.name ?? "Región Metropolitana";
      if (addr.comment) addressNotes = addr.comment;
      console.log("[ML] Dirección obtenida del shipment:", shippingId);
    }

    const buyer = mlOrder.buyer ?? {};
    const items = mlOrder.order_items ?? [];
    const totalBultos = items.reduce(
      (sum: number, item: any) => sum + (item.quantity ?? 1),
      0,
    );

    const { createOrder } = await import("@/lib/services/order.service");
    await createOrder({
      storeId: integration.storeId,
      integrationId: integration.id,
      platform: "MERCADOLIBRE",
      sourceId: orderId,
      customerName:
        `${buyer.first_name ?? ""} ${buyer.last_name ?? ""}`.trim() ||
        "Cliente ML",
      customerPhone: buyer.phone?.number ?? null,
      customerEmail: buyer.email ?? null,
      addressStreet,
      addressComuna,
      addressRegion,
      addressNotes,
      bultos: totalBultos || 1,
      rawPayload: {
        ...mlOrder,
        shipping: shipment ?? mlOrder.shipping,
        pack_id: mlOrder.pack_id,
      },
      createdBy: "webhook",
    });

    console.log("[ML webhook] ✅ Pedido creado:", orderId);
    return NextResponse.json({ ok: true, created: true });
  } catch (err: any) {
    console.error("[ML webhook] Error:", err.message);
    return NextResponse.json({ ok: true, error: err.message });
  }
}
