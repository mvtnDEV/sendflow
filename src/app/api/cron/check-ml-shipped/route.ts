export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decrypt, encrypt } from "@/lib/utils/crypto";
import { refreshMLToken } from "@/lib/integrations/mercadolibre";
import { notificarEntregaAFret } from "@/lib/services/fret.service";

// ── Tiendas Fret: Flex puede CERRAR delivered (respaldo), nunca INCIDENT ──
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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const pendientes = await prisma.order.findMany({
    where: {
      platform: "MERCADOLIBRE",
      status: { in: ["RECEIVED", "IN_TRANSIT"] },
      integrationId: { not: null },
    },
    select: {
      id: true,
      orderNumber: true,
      storeId: true,
      integrationId: true,
      rawPayload: true,
      mlShippedAt: true,
    },
  });

  console.log(
    `[Cron ML Shipped] Revisando ${pendientes.length} pedidos ML Flex activos`,
  );

  const results = [];

  for (const order of pendientes) {
    console.log("[Cron ML Shipped] >>> INICIO", order.orderNumber);
    try {
      const shippingId = (order.rawPayload as any)?.shipping?.id;
      console.log(
        "[Cron ML Shipped] shippingId:",
        order.orderNumber,
        "=",
        shippingId,
      );

      if (!shippingId || !order.integrationId) {
        console.log(
          "[Cron ML Shipped] SKIP sin_shipping_id:",
          order.orderNumber,
        );
        results.push({
          orderNumber: order.orderNumber,
          status: "sin_shipping_id",
        });
        continue;
      }

      const integration = await prisma.storeIntegration.findUnique({
        where: { id: order.integrationId },
      });
      if (!integration) {
        results.push({
          orderNumber: order.orderNumber,
          status: "sin_integracion",
        });
        continue;
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

      let res: Response;
      try {
        res = await fetch(
          `https://api.mercadolibre.com/shipments/${shippingId}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(8000),
            cache: "no-store",
          },
        );
      } catch (fetchErr: any) {
        console.error(
          "[Cron ML Shipped] Fetch falló:",
          order.orderNumber,
          fetchErr.message,
        );
        results.push({
          orderNumber: order.orderNumber,
          status: "fetch_error",
          message: fetchErr.message,
        });
        continue;
      }

      if (res.status === 401 || res.status === 403) {
        try {
          const refreshed = await refreshMLToken(refreshToken);
          await prisma.storeIntegration.update({
            where: { id: integration.id },
            data: {
              apiKeyEnc: encrypt(
                `${refreshed.accessToken}|${refreshed.refreshToken}`,
              ),
            },
          });
          res = await fetch(
            `https://api.mercadolibre.com/shipments/${shippingId}`,
            {
              headers: { Authorization: `Bearer ${refreshed.accessToken}` },
              signal: AbortSignal.timeout(8000),
              cache: "no-store",
            },
          );
        } catch (refreshErr: any) {
          console.error(
            "[Cron ML Shipped] Refresh token falló:",
            order.orderNumber,
            refreshErr.message,
          );
          results.push({
            orderNumber: order.orderNumber,
            status: "refresh_error",
            message: refreshErr.message,
          });
          continue;
        }
      }

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        console.log(
          "[Cron ML Shipped] Error API ML:",
          order.orderNumber,
          res.status,
          errBody.slice(0, 200),
        );
        results.push({
          orderNumber: order.orderNumber,
          status: "error_api",
          code: res.status,
        });
        continue;
      }

      const shipment = await res.json();
      const status = shipment?.status ?? null;
      const substatus = shipment?.substatus ?? null;
      const dateShipped = shipment?.status_history?.date_shipped ?? null;

      console.log(
        "[Cron ML Shipped]",
        order.orderNumber,
        "| status:",
        status,
        "| substatus:",
        substatus,
        "| date_shipped:",
        dateShipped,
      );

      const esTiendaFret = TIENDAS_FRET.has(order.storeId);

      // ── TIENDA FRET: Flex solo puede CERRAR delivered (respaldo). Nunca INCIDENT. ──
      if (esTiendaFret) {
        // Registrar escaneo si no estaba
        if (dateShipped && !order.mlShippedAt) {
          await prisma.order.update({
            where: { id: order.id },
            data: { mlShippedAt: new Date(dateShipped) },
          });
        }

        // RESPALDO: si Flex confirma entrega → cerrar DELIVERED
        if (status === "delivered") {
          const fechaEntrega = new Date();
          await prisma.order.update({
            where: { id: order.id },
            data: {
              status: "DELIVERED",
              deliveredAt: fechaEntrega,
              ...(dateShipped && { mlShippedAt: new Date(dateShipped) }),
              events: {
                create: {
                  status: "DELIVERED",
                  note: "Flex confirmó entrega (respaldo — Fret no había cerrado)",
                  createdBy: "ml-cron-check",
                },
              },
            },
          });
          console.log(
            "[Cron ML Shipped] ✅ Tienda Fret · CERRADO por respaldo Flex:",
            order.orderNumber,
          );

          // ── Avisar a Fret que Flex entregó, para que cierren en su sistema ──
          const referencia = order.orderNumber.replace("#", "");
          const fretResp = await notificarEntregaAFret({
            referencia,
            shipmentId: String(shippingId),
            fecha: fechaEntrega.toISOString(),
          });

          results.push({
            orderNumber: order.orderNumber,
            status: "fret_cerrado_por_flex",
            fretNotificado: fretResp.ok,
            fretError: fretResp.ok ? undefined : fretResp.error,
          });
        } else {
          results.push({
            orderNumber: order.orderNumber,
            status: "fret_en_curso",
            mlStatus: status,
          });
        }
        console.log("[Cron ML Shipped] >>> FIN", order.orderNumber);
        continue;
      }

      // ── TIENDAS NOW (resto): lógica original completa ──
      const esNoEntregado =
        SHIPMENT_NO_ENTREGADO.includes(status) ||
        SUBSTATUS_NO_ENTREGADO.includes(substatus);

      if (esNoEntregado) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "INCIDENT",
            events: {
              create: {
                status: "INCIDENT",
                note: `ML Flex · No entregado · ${status ?? ""}${substatus ? ` · ${substatus}` : ""}`,
                createdBy: "ml-cron-check",
              },
            },
          },
        });
        console.log(
          "[Cron ML Shipped] ❌ Cerrado como INCIDENT:",
          order.orderNumber,
          status,
          substatus,
        );
        results.push({
          orderNumber: order.orderNumber,
          status: "closed_incident",
          mlStatus: status,
          substatus,
        });
        continue;
      }

      if (status === "delivered") {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "DELIVERED",
            deliveredAt: new Date(),
            ...(dateShipped && { mlShippedAt: new Date(dateShipped) }),
            events: {
              create: {
                status: "DELIVERED",
                note: "ML Flex confirmó entrega",
                createdBy: "ml-cron-check",
              },
            },
          },
        });
        console.log(
          "[Cron ML Shipped] ✅ Cerrado como DELIVERED:",
          order.orderNumber,
        );
        results.push({
          orderNumber: order.orderNumber,
          status: "closed_delivered",
        });
        continue;
      }

      if (dateShipped && !order.mlShippedAt) {
        await prisma.order.update({
          where: { id: order.id },
          data: { mlShippedAt: new Date(dateShipped) },
        });
        console.log(
          "[Cron ML Shipped] ✅ Confirmado escaneo Flex:",
          order.orderNumber,
          dateShipped,
        );
        results.push({
          orderNumber: order.orderNumber,
          status: "shipped_confirmed",
          dateShipped,
        });
      } else {
        console.log(
          "[Cron ML Shipped] Aún en tránsito:",
          order.orderNumber,
          status,
        );
        results.push({
          orderNumber: order.orderNumber,
          status: "aun_en_transito",
          mlStatus: status,
        });
      }
    } catch (err: any) {
      console.error(
        "[Cron ML Shipped] ❌ Error inesperado:",
        order.orderNumber,
        err?.message,
      );
      results.push({
        orderNumber: order.orderNumber,
        status: "error",
        message: err?.message,
      });
    }

    console.log("[Cron ML Shipped] >>> FIN", order.orderNumber);
  }

  console.log("[Cron ML Shipped] Terminado. Total procesados:", results.length);
  return NextResponse.json({ ok: true, checked: pendientes.length, results });
}
