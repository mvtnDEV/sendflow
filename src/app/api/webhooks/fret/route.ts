export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import crypto from "crypto";

const STATE_MAP: Record<string, string> = {
  received: "", // ← ignorar
  dispatched: "", // ← ignorar — solo armaron la ruta
  picked_up: "RECEIVED", // ← recién retiraron físicamente
  in_transit: "IN_TRANSIT",
  delivered: "DELIVERED",
  failed: "INCIDENT",
  cancelled: "CANCELLED",
};
const STATUS_PRIORITY: Record<string, number> = {
  PENDING: 0,
  RECEIVED: 1,
  DISPATCHED: 2,
  PICKED_UP: 3,
  IN_TRANSIT: 4,
  DELIVERED: 5,
  INCIDENT: 6,
  CANCELLED: 7,
};

function verificarFirma(
  secret: string,
  signatureHeader: string,
  rawBody: string,
): boolean {
  try {
    const t = /t=(\d+)/.exec(signatureHeader)?.[1];
    const v1 = /v1=([0-9a-f]+)/.exec(signatureHeader)?.[1];
    if (!t || !v1) return false;
    if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
    const esperado = crypto
      .createHmac("sha256", secret)
      .update(`${t}.${rawBody}`)
      .digest("hex");
    return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(v1));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-fret-signature") ?? "";
  const deliveryId = req.headers.get("x-fret-delivery") ?? "";

  console.log(
    "[Fret webhook] delivery:",
    deliveryId,
    "| body:",
    rawBody.slice(0, 300),
  );

  // ── Verificar firma ──
  const secret = process.env.FRET_WEBHOOK_SECRET;
  if (secret && signatureHeader) {
    if (!verificarFirma(secret, signatureHeader, rawBody)) {
      console.error("[Fret webhook] Firma inválida");
      return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
    }
  }

  const procesarWebhook = async () => {
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      console.error("[Fret webhook] JSON inválido");
      return;
    }

    if (body.event !== "order.status_changed") {
      console.log("[Fret webhook] Evento ignorado:", body.event);
      return;
    }

    const { referencia, order_code, status, occurred_at, pod } =
      body.data ?? {};

    if (!referencia || !status) {
      console.error("[Fret webhook] Faltan campos requeridos");
      return;
    }

    const newStatus = STATE_MAP[String(status).toLowerCase()];
    if (!newStatus) {
      console.log("[Fret webhook] Estado desconocido, ignorando:", status);
      return;
    }

    // ── Extraer evidencia del pod si viene ──
    const evidencePhoto1 = pod?.photos?.[0] ?? null;
    const evidencePhoto2 = pod?.photos?.[1] ?? null;
    const receptorName = pod?.receiver_name ?? null;
    const receptorRut = pod?.receiver_rut ?? null;
    const evidenceNote =
      [
        receptorName ? `Recibió: ${receptorName}` : null,
        receptorRut ? `RUT: ${receptorRut}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null;

    let lastError: any;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const order = await prisma.order.findFirst({
          where: {
            OR: [
              { orderNumber: referencia },
              { orderNumber: `#${referencia}` },
              { externalId: order_code },
              { externalId: referencia },
              { qrCode: referencia },
            ],
          },
          select: { id: true, orderNumber: true, status: true },
        });

        if (!order) {
          console.log("[Fret webhook] Pedido no encontrado:", referencia);
          return;
        }

        console.log(
          "[Fret webhook] Pedido encontrado:",
          order.orderNumber,
          "| estado actual:",
          order.status,
          "| nuevo:",
          newStatus,
        );

        if (
          (STATUS_PRIORITY[newStatus] ?? 0) <=
          (STATUS_PRIORITY[order.status] ?? 0)
        ) {
          console.log(
            "[Fret webhook] Estado ignorado por prioridad:",
            order.orderNumber,
            order.status,
            "->",
            newStatus,
          );
          return;
        }

        const previousStatus = order.status;
        const now = occurred_at ? new Date(occurred_at) : new Date();

        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: newStatus as any,
            ...(newStatus === "RECEIVED" && { receivedAt: now }),
            ...(newStatus === "IN_TRANSIT" && { inTransitAt: now }),
            ...(newStatus === "DELIVERED" && {
              deliveredAt: now,
              // ── Guardar evidencia del pod ──
              ...(evidencePhoto1 && { evidencePhoto1 }),
              ...(evidencePhoto2 && { evidencePhoto2 }),
              ...(receptorName && { receptorName }),
              ...(receptorRut && { receptorRut }),
              ...(evidenceNote && { evidenceNote }),
            }),
            ...(order_code && { externalId: order_code }),
            events: {
              create: {
                status: newStatus as any,
                note: `Actualizado por Moovex · ${status}${receptorName ? ` · Recibió: ${receptorName}` : ""}`,
                createdBy: "fret-webhook",
              },
            },
          },
        });

        console.log(
          "[Fret webhook] ✅ Actualizado:",
          order.orderNumber,
          "->",
          newStatus,
          pod ? "| con evidencia" : "",
        );

        try {
          const { notifyWebhooks } =
            await import("@/lib/services/webhook.service");
          await notifyWebhooks(order.id, newStatus, String(previousStatus));
        } catch (err) {
          console.error("[Fret webhook] Error notificando webhook:", err);
        }

        return;
      } catch (err: any) {
        lastError = err;
        console.error(
          `[Fret webhook] Intento ${attempt}/3 falló:`,
          err.message,
        );
        if (attempt < 3)
          await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    console.error(
      "[Fret webhook] Se agotaron los 3 intentos:",
      lastError?.message,
    );
  };

  procesarWebhook().catch((err) =>
    console.error("[Fret webhook] Error procesando:", err),
  );
  return NextResponse.json({ ok: true });
}
