export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decrypt, encrypt } from "@/lib/utils/crypto";
import { refreshMLToken } from "@/lib/integrations/mercadolibre";

// ── Desde el 24-sep-2026 ninguna tienda nueva va a Fret. ──
// Los pedidos viejos que tienen FR- se siguen notificando a Fret
// por la condición externalId?.startsWith("FR-").
const TIENDAS_FRET = new Set<string>([]);

async function getToken(integration: {
  id: string;
  apiKeyEnc: string;
}): Promise<string> {
  const creds = decrypt(integration.apiKeyEnc);
  let accessToken: string;
  let refreshToken: string;

  if (creds.startsWith("{")) {
    const parsed = JSON.parse(creds);
    accessToken = parsed.accessToken;
    refreshToken = parsed.refreshToken;
  } else {
    [accessToken, refreshToken] = creds.split("|");
  }

  // Verificar si funciona
  const test = await fetch("https://api.mercadolibre.com/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (test.status === 401 || test.status === 403) {
    // Renovar
    const refreshed = await refreshMLToken(refreshToken);
    await prisma.storeIntegration.update({
      where: { id: integration.id },
      data: {
        apiKeyEnc: encrypt(
          `${refreshed.accessToken}|${refreshed.refreshToken}`,
        ),
        refreshToken: refreshed.refreshToken,
        lastSyncAt: new Date(),
      },
    });
    console.log("[ML webhook] 🔄 Token renovado automáticamente");
    return refreshed.accessToken;
  }

  return accessToken;
}

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

  let token: string;
  try {
    token = await getToken(integration);
  } catch (err: any) {
    console.error(
      "[ML webhook] ❌ Error obteniendo token:",
      integration.store?.name,
      err.message,
    );
    return NextResponse.json({ ok: true, token_error: err.message });
  }

  try {
    const mlRes = await fetch(
      `https://api.mercadolibre.com/orders/${orderId}`,
      { headers: { Authorization: `Bearer ${token}` } },
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
          { headers: { Authorization: `Bearer ${token}` } },
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

    // ── Anti-duplicado: verificar una vez más antes de crear ──
    const dobleCheck = await prisma.order.findFirst({
      where: { sourceId: orderId, storeId: integration.storeId },
      select: { id: true, orderNumber: true },
    });
    if (dobleCheck) {
      console.log(
        "[ML webhook] Anti-duplicado: ya existe",
        dobleCheck.orderNumber,
        "para sourceId:",
        orderId,
      );
      return NextResponse.json({ ok: true, already_exists: true });
    }

    const { createOrder } = await import("@/lib/services/order.service");
    try {
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
    } catch (createErr: any) {
      if (createErr.code === "P2002") {
        console.log("[ML webhook] Anti-duplicado (DB):", orderId);
        return NextResponse.json({ ok: true, already_exists: true });
      }
      throw createErr;
    }
  } catch (err: any) {
    console.error("[ML webhook] Error:", err.message);
    return NextResponse.json({ ok: true, error: err.message });
  }
}
