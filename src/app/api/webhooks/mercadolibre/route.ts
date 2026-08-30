export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decrypt, encrypt } from "@/lib/utils/crypto";
import {
  fetchMLOrder,
  extractMLOrderId,
  refreshMLToken,
} from "@/lib/integrations/mercadolibre";
import { upsertOrderFromWebhook } from "@/lib/services/order.service";
import { notificarEntregaAFret } from "@/lib/services/fret.service";

// ── Tiendas que operan con Fret ──
const TIENDAS_FRET = new Set([
  "cmpk7nslz0006r5e73du6f0kp", // Comercial Bess
  "cmouw44ej0004thpecq6bct35", // Eco pañal
  "cmouw23l60003thpe1q7f16r3", // Oasis verde
  "cmpbfadyd00032vgl7klna40b", // Fire Master
  "cmovurlze000018duer7sffp4", // Protec
]);

const SHIPMENT_NO_ENTREGADO = [
  "not_delivered",
  "returning",
  "returned",
  "lost",
  "damaged",
];
const SUBSTATUS_NO_ENTREGADO = [
  "receiver_absent",
  "address_problem",
  "first_attempt_failed",
  "second_attempt_failed",
  "out_of_delivery_hours",
  "refused_delivery",
  "stolen",
];
const ORDER_TAGS_NO_ENTREGADO = ["not_delivered", "returning", "returned"];

function getMLStatus(order: any, shipment?: any): string | null {
  const shipStatus = shipment?.status ?? null;
  const substatus = shipment?.substatus ?? null;
  const orderStatus = order?.status ?? null;
  const orderTags = order?.tags ?? [];

  if (shipStatus === "delivered") return "DELIVERED";
  if (shipStatus === "shipped") return "IN_TRANSIT";
  // Flex canceló → en Moovex se cierra como NO ENTREGADO (INCIDENT).
  // "CANCELLED" queda reservado para cancelaciones nuestras o de la tienda.
  if (shipStatus === "cancelled" || orderStatus === "cancelled")
    return "INCIDENT";
  if (SHIPMENT_NO_ENTREGADO.includes(shipStatus)) return "INCIDENT";
  if (SUBSTATUS_NO_ENTREGADO.includes(substatus)) return "INCIDENT";
  if (orderTags.some((t: string) => ORDER_TAGS_NO_ENTREGADO.includes(t)))
    return "INCIDENT";

  return null;
}

export async function POST(req: NextRequest) {
  let body: any = null;
  try {
    const raw = await req.text();
    if (!raw || raw.trim() === "") {
      console.log("[ML webhook] Body vacío, ignorando");
      return NextResponse.json({ ok: true, skipped: true });
    }
    body = JSON.parse(raw);
  } catch (parseErr) {
    console.error("[ML webhook] Body no es JSON válido:", parseErr);
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (!body) return NextResponse.json({ ok: true, skipped: true });

  console.log("[ML webhook] body:", JSON.stringify(body));

  if (body.topic !== "orders_v2") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const orderId = extractMLOrderId(body.resource);
  if (!orderId) {
    console.error("[ML webhook] resource inválido:", body.resource);
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const integration = await prisma.storeIntegration.findFirst({
      where: {
        platform: "MERCADOLIBRE",
        externalStoreId: String(body.user_id),
        isActive: true,
      },
    });

    if (!integration) {
      console.error(
        "[ML webhook] Integración no encontrada para user_id:",
        body.user_id,
      );
      return NextResponse.json({ ok: true, skipped: true });
    }

    const creds = decrypt(integration.apiKeyEnc);
    let accessToken: string;
    let refreshToken: string;

    if (creds.startsWith("{")) {
      const parsed = JSON.parse(creds);
      accessToken = parsed.accessToken;
      refreshToken = parsed.refreshToken;
    } else {
      const [at, rt] = creds.split("|");
      accessToken = at;
      refreshToken = rt;
    }

    let token = accessToken;
    let normalized: any;
    let rawOrder: any;
    let rawShipment: any;

    try {
      const res = await fetch(
        `https://api.mercadolibre.com/orders/${orderId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      if (!res.ok) throw new Error(`ML API ${res.status}`);
      rawOrder = await res.json();

      if (!rawOrder.shipping?.id) {
        console.log("[ML webhook] Pedido sin despacho, ignorando:", orderId);
        return NextResponse.json({ ok: true, skipped: true });
      }

      const shipRes = await fetch(
        `https://api.mercadolibre.com/shipments/${rawOrder.shipping.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      if (shipRes.ok) {
        rawShipment = await shipRes.json();
        console.log(
          "[ML webhook] Shipment status:",
          rawShipment.status,
          "| substatus:",
          rawShipment.substatus,
        );
      }

      normalized = await fetchMLOrder(orderId, token);
    } catch (err: any) {
      if (err.message?.includes("401") || err.message?.includes("403")) {
        console.log("[ML webhook] Token expirado, haciendo refresh...");
        try {
          const refreshed = await refreshMLToken(refreshToken);
          token = refreshed.accessToken;
          await prisma.storeIntegration.update({
            where: { id: integration.id },
            data: {
              apiKeyEnc: encrypt(
                `${refreshed.accessToken}|${refreshed.refreshToken}`,
              ),
            },
          });
          normalized = await fetchMLOrder(orderId, token);
          if (!normalized)
            return NextResponse.json({ ok: true, skipped: true });
        } catch (refreshErr) {
          console.error("[ML webhook] Error en refresh de token:", refreshErr);
          return NextResponse.json({ ok: true, skipped: true });
        }
      } else {
        console.error("[ML webhook] Error consultando ML API:", err);
        return NextResponse.json({ ok: true, skipped: true });
      }
    }

    if (normalized) {
      try {
        await upsertOrderFromWebhook(
          integration.storeId,
          integration.id,
          normalized,
        );
      } catch (err: any) {
        if (err.message?.includes("fuera de zona de despacho")) {
          console.log(
            "[ML webhook] Pedido fuera de RM, ignorado:",
            orderId,
            "·",
            err.message.split(":")[1]?.trim(),
          );
          return NextResponse.json({
            ok: true,
            skipped: true,
            reason: "fuera_de_zona",
          });
        }
        throw err;
      }
    }

    const esTiendaFret = TIENDAS_FRET.has(integration.storeId);
    const newStatus = getMLStatus(rawOrder, rawShipment);

    // ── LÓGICA PARA TIENDAS FRET ──
    // Flex cierra entregas (delivered) como respaldo y cierra como no entregado
    // cuando CANCELA. Los demás no-entregados no tocan el estado: los controla
    // el operador.
    if (esTiendaFret) {
      const existing = await prisma.order.findFirst({
        where: { integrationId: integration.id, sourceId: String(orderId) },
        select: { id: true, status: true, orderNumber: true },
      });

      if (existing) {
        const dateShipped = rawShipment?.status_history?.date_shipped ?? null;
        const now = new Date();

        // Registrar escaneo Flex siempre que exista
        if (dateShipped) {
          await prisma.order.update({
            where: { id: existing.id },
            data: { mlShippedAt: new Date(dateShipped) },
          });
        }

        // ── RESPALDO: si Flex dice DELIVERED y el pedido aún no está cerrado → cerrar ──
        if (newStatus === "DELIVERED" && existing.status !== "DELIVERED") {
          const fechaEntrega = new Date();
          await prisma.order.update({
            where: { id: existing.id },
            data: {
              status: "DELIVERED",
              deliveredAt: fechaEntrega,
              events: {
                create: {
                  status: "DELIVERED",
                  note: "Flex confirmó entrega (respaldo — Fret no había cerrado)",
                  createdBy: "ml-webhook",
                },
              },
            },
          });
          console.log(
            "[ML webhook] Tienda Fret · CERRADO por respaldo Flex:",
            orderId,
          );

          // ── Avisar a Fret que Flex entregó, para que cierren en su sistema ──
          const referencia = (existing.orderNumber ?? "").replace("#", "");
          const shippingId = rawOrder?.shipping?.id;
          if (referencia) {
            const fretResp = await notificarEntregaAFret({
              referencia,
              shipmentId: shippingId ? String(shippingId) : undefined,
              fecha: fechaEntrega.toISOString(),
            });
            console.log(
              "[ML webhook] Notificación a Fret:",
              referencia,
              "| ok:",
              fretResp.ok,
              fretResp.ok ? "" : `| error: ${fretResp.error}`,
            );
          }
        } else if (
          (rawShipment?.status === "cancelled" ||
            rawOrder?.status === "cancelled") &&
          !["DELIVERED", "INCIDENT"].includes(existing.status)
        ) {
          // ── Flex CANCELÓ: se cierra como no entregado, aunque sea tienda Fret ──
          await prisma.order.update({
            where: { id: existing.id },
            data: {
              status: "INCIDENT",
              events: {
                create: {
                  status: "INCIDENT",
                  note: "ML Flex canceló el envío",
                  createdBy: "ml-webhook",
                },
              },
            },
          });
          console.log(
            "[ML webhook] Tienda Fret · CERRADO como no entregado (Flex canceló):",
            orderId,
          );
        } else {
          console.log(
            "[ML webhook] Tienda Fret · solo escaneo registrado (Flex no delivered):",
            orderId,
          );
        }
      }

      await prisma.storeIntegration.update({
        where: { id: integration.id },
        data: { lastSyncAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    }

    // ── LÓGICA PARA TIENDAS NOW (resto) — sin cambios ──
    if (
      newStatus &&
      ["DELIVERED", "INCIDENT", "CANCELLED"].includes(newStatus)
    ) {
      const existing = await prisma.order.findFirst({
        where: { integrationId: integration.id, sourceId: String(orderId) },
        select: { id: true, status: true },
      });

      if (
        existing &&
        existing.status !== newStatus &&
        existing.status !== "DELIVERED"
      ) {
        const now = new Date();
        const dateShipped = rawShipment?.status_history?.date_shipped ?? null;
        const motivo =
          rawShipment?.substatus ??
          rawOrder?.tags?.find((t: string) =>
            ORDER_TAGS_NO_ENTREGADO.includes(t),
          ) ??
          newStatus;

        await prisma.order.update({
          where: { id: existing.id },
          data: {
            status: newStatus as any,
            ...(newStatus === "DELIVERED" && { deliveredAt: now }),
            ...(dateShipped && { mlShippedAt: new Date(dateShipped) }),
            events: {
              create: {
                status: newStatus as any,
                note:
                  rawShipment?.status === "cancelled" ||
                  rawOrder?.status === "cancelled"
                    ? "ML Flex canceló el envío"
                    : newStatus === "INCIDENT"
                      ? `ML Flex · No entregado · ${motivo}`
                      : `ML Flex · Estado actualizado a ${newStatus}`,
                createdBy: "ml-webhook",
              },
            },
          },
        });
        console.log(
          "[ML webhook] Estado actualizado:",
          orderId,
          "->",
          newStatus,
          "| motivo:",
          motivo,
        );
      }
    }

    await prisma.storeIntegration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[ML webhook] Error interno:", err);
    return NextResponse.json({ ok: true, error: "handled" });
  }
}

