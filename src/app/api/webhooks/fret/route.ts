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

function extraerEvidencia(pod: any) {
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
  const traeEvidencia = !!(
    evidencePhoto1 ||
    evidencePhoto2 ||
    receptorName ||
    receptorRut
  );
  return {
    evidencePhoto1,
    evidencePhoto2,
    receptorName,
    receptorRut,
    evidenceNote,
    traeEvidencia,
  };
}

async function buscarPedido(referencia: string, order_code?: string) {
  return prisma.order.findFirst({
    where: {
      OR: [
        { orderNumber: referencia },
        { orderNumber: `#${referencia}` },
        ...(order_code ? [{ externalId: order_code }] : []),
        { externalId: referencia },
        { qrCode: referencia },
      ],
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      externalId: true,
      evidencePhoto1: true,
      evidencePhoto2: true,
      receptorName: true,
      receptorRut: true,
    },
  });
}

async function propagarAPack(
  orderId: string,
  externalId: string | null,
  data: any,
) {
  if (!externalId || !externalId.startsWith("FR-")) return;

  const hermanas = await prisma.order.findMany({
    where: {
      externalId,
      id: { not: orderId },
    },
    select: { id: true, orderNumber: true, status: true },
  });

  for (const hermana of hermanas) {
    const newPriority = STATUS_PRIORITY[data.status] ?? 0;
    const currentPriority = STATUS_PRIORITY[hermana.status] ?? 0;
    if (newPriority <= currentPriority) continue;

    await prisma.order.update({
      where: { id: hermana.id },
      data: {
        status: data.status,
        ...(data.receivedAt && { receivedAt: data.receivedAt }),
        ...(data.inTransitAt && { inTransitAt: data.inTransitAt }),
        ...(data.deliveredAt && { deliveredAt: data.deliveredAt }),
        ...(data.evidencePhoto1 && { evidencePhoto1: data.evidencePhoto1 }),
        ...(data.evidencePhoto2 && { evidencePhoto2: data.evidencePhoto2 }),
        ...(data.receptorName && { receptorName: data.receptorName }),
        ...(data.receptorRut && { receptorRut: data.receptorRut }),
        ...(data.evidenceNote && { evidenceNote: data.evidenceNote }),
        events: {
          create: {
            status: data.status,
            note: data.eventNote ?? `Actualizado por Moovex (pack)`,
            createdBy: "fret-webhook",
          },
        },
      },
    });
    console.log(
      "[Fret webhook] 📦 Pack propagado:",
      hermana.orderNumber,
      "->",
      data.status,
    );
  }
}

// ── Determina si el externalId del pedido es de un sistema externo (Senby) ──
// y no debe sobreescribirse con el order_code de Fret.
function esExternalIdExterno(externalId: string | null): boolean {
  if (!externalId) return false;
  if (externalId.startsWith("FR-")) return false; // Ya es de Fret
  return true; // Es de Senby u otro sistema
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-fret-signature") ?? "";
  const deliveryId = req.headers.get("x-fret-delivery") ?? "";
  const eventHeader = req.headers.get("x-fret-event") ?? "";

  console.log(
    "[Fret webhook] delivery:",
    deliveryId,
    "| event:",
    eventHeader,
    "| body:",
    rawBody.slice(0, 300),
  );

  const secret = process.env.FRET_WEBHOOK_SECRET;
  if (secret && signatureHeader) {
    if (!verificarFirma(secret, signatureHeader, rawBody)) {
      console.error("[Fret webhook] Firma inválida");
      return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
    }
  }

  // ── AWAIT el procesamiento para que Vercel no mate la función ──
  try {
    await procesarWebhook(rawBody, eventHeader);
  } catch (err) {
    console.error("[Fret webhook] Error procesando:", err);
  }

  return NextResponse.json({ ok: true });
}

async function procesarWebhook(rawBody: string, eventHeader: string) {
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.error("[Fret webhook] JSON inválido");
    return;
  }

  const evento = eventHeader || body.event;
  const { referencia, order_code, status, occurred_at, pod } = body.data ?? {};

  if (!referencia) {
    console.error("[Fret webhook] Falta referencia");
    return;
  }

  // ══════════════════════════════════════════════════════════════
  // EVENTO 1: order.pod_added — foto después de la entrega
  // ══════════════════════════════════════════════════════════════
  if (evento === "order.pod_added") {
    const ev = extraerEvidencia(pod);
    if (!ev.traeEvidencia) {
      console.log(
        "[Fret webhook] pod_added sin evidencia, ignorando:",
        referencia,
      );
      return;
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const order = await buscarPedido(referencia, order_code);
        if (!order) {
          console.log(
            "[Fret webhook] pod_added · pedido no encontrado:",
            referencia,
          );
          return;
        }

        const yaTeniaEvidencia = !!(
          order.evidencePhoto1 ||
          order.evidencePhoto2 ||
          order.receptorName ||
          order.receptorRut
        );

        if (yaTeniaEvidencia) {
          console.log(
            "[Fret webhook] pod_added · ya tenía evidencia, ignorando:",
            order.orderNumber,
          );
          return;
        }

        await prisma.order.update({
          where: { id: order.id },
          data: {
            ...(ev.evidencePhoto1 && { evidencePhoto1: ev.evidencePhoto1 }),
            ...(ev.evidencePhoto2 && { evidencePhoto2: ev.evidencePhoto2 }),
            ...(ev.receptorName && { receptorName: ev.receptorName }),
            ...(ev.receptorRut && { receptorRut: ev.receptorRut }),
            ...(ev.evidenceNote && { evidenceNote: ev.evidenceNote }),
            events: {
              create: {
                status: "DELIVERED",
                note: `Evidencia de entrega recibida${ev.receptorName ? ` · Recibió: ${ev.receptorName}` : ""}`,
                createdBy: "fret-webhook",
              },
            },
          },
        });

        await propagarAPack(order.id, order.externalId, {
          status: "DELIVERED",
          evidencePhoto1: ev.evidencePhoto1,
          evidencePhoto2: ev.evidencePhoto2,
          receptorName: ev.receptorName,
          receptorRut: ev.receptorRut,
          evidenceNote: ev.evidenceNote,
          eventNote: `Evidencia de entrega recibida${ev.receptorName ? ` · Recibió: ${ev.receptorName}` : ""}`,
        });

        console.log(
          "[Fret webhook] 📸 Evidencia completada (pod_added):",
          order.orderNumber,
        );
        return;
      } catch (err: any) {
        console.error(
          `[Fret webhook] pod_added intento ${attempt}/3:`,
          err.message,
        );
        if (attempt < 3)
          await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    return;
  }

  // ══════════════════════════════════════════════════════════════
  // EVENTO 2: order.status_changed — cambio de estado
  // ══════════════════════════════════════════════════════════════
  if (evento !== "order.status_changed") {
    console.log("[Fret webhook] Evento ignorado:", evento);
    return;
  }

  if (!status) {
    console.error("[Fret webhook] Falta status");
    return;
  }

  const newStatus = STATE_MAP[String(status).toLowerCase()];
  if (!newStatus) {
    console.log("[Fret webhook] Estado desconocido, ignorando:", status);
    return;
  }

  const ev = extraerEvidencia(pod);

  let lastError: any;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const order = await buscarPedido(referencia, order_code);

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

      // ── PROTECCIÓN PENDING ──
      // Sobre PENDING solo aceptar: RECEIVED, IN_TRANSIT, DELIVERED
      // Bloquear: INCIDENT, CANCELLED sobre pedidos no retirados
      if (
        order.status === "PENDING" &&
        !["RECEIVED", "IN_TRANSIT", "DELIVERED"].includes(newStatus)
      ) {
        console.log(
          "[Fret webhook] Ignorando",
          newStatus,
          "sobre PENDING (no fue retirado):",
          order.orderNumber,
        );
        return;
      }

      // ── CASO ESPECIAL: pedido ya DELIVERED pero SIN evidencia ──
      const yaEstabaDelivered = order.status === "DELIVERED";
      const noTeniaEvidencia = !(
        order.evidencePhoto1 ||
        order.evidencePhoto2 ||
        order.receptorName ||
        order.receptorRut
      );

      if (
        newStatus === "DELIVERED" &&
        yaEstabaDelivered &&
        noTeniaEvidencia &&
        ev.traeEvidencia
      ) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            ...(ev.evidencePhoto1 && { evidencePhoto1: ev.evidencePhoto1 }),
            ...(ev.evidencePhoto2 && { evidencePhoto2: ev.evidencePhoto2 }),
            ...(ev.receptorName && { receptorName: ev.receptorName }),
            ...(ev.receptorRut && { receptorRut: ev.receptorRut }),
            ...(ev.evidenceNote && { evidenceNote: ev.evidenceNote }),
            events: {
              create: {
                status: "DELIVERED",
                note: `Evidencia de entrega recibida${ev.receptorName ? ` · Recibió: ${ev.receptorName}` : ""}`,
                createdBy: "fret-webhook",
              },
            },
          },
        });

        await propagarAPack(order.id, order.externalId, {
          status: "DELIVERED",
          evidencePhoto1: ev.evidencePhoto1,
          evidencePhoto2: ev.evidencePhoto2,
          receptorName: ev.receptorName,
          receptorRut: ev.receptorRut,
          evidenceNote: ev.evidenceNote,
          eventNote: `Evidencia de entrega recibida${ev.receptorName ? ` · Recibió: ${ev.receptorName}` : ""}`,
        });

        console.log(
          "[Fret webhook] 📸 Evidencia completada (ya estaba entregado):",
          order.orderNumber,
        );
        return;
      }

      // ── Excepción: un pedido en INCIDENT puede recuperarse ──
      const esRecuperacionDeIncidente = order.status === "INCIDENT";

      if (
        !esRecuperacionDeIncidente &&
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

      // ── Proteger externalId de sistemas externos (Senby) ──
      // Solo setear order_code como externalId si el pedido no tiene uno externo
      const debeSetearExternalId =
        order_code && !esExternalIdExterno(order.externalId);

      const updateData: any = {
        status: newStatus as any,
        ...(newStatus === "RECEIVED" && { receivedAt: now }),
        ...(newStatus === "IN_TRANSIT" && { inTransitAt: now }),
        ...(newStatus === "DELIVERED" && {
          deliveredAt: now,
          ...(ev.evidencePhoto1 && { evidencePhoto1: ev.evidencePhoto1 }),
          ...(ev.evidencePhoto2 && { evidencePhoto2: ev.evidencePhoto2 }),
          ...(ev.receptorName && { receptorName: ev.receptorName }),
          ...(ev.receptorRut && { receptorRut: ev.receptorRut }),
          ...(ev.evidenceNote && { evidenceNote: ev.evidenceNote }),
        }),
        ...(debeSetearExternalId && { externalId: order_code }),
        events: {
          create: {
            status: newStatus as any,
            note: `Actualizado por Moovex · ${status}${ev.receptorName ? ` · Recibió: ${ev.receptorName}` : ""}`,
            createdBy: "fret-webhook",
          },
        },
      };

      await prisma.order.update({
        where: { id: order.id },
        data: updateData,
      });

      console.log(
        "[Fret webhook] ✅ Actualizado:",
        order.orderNumber,
        "->",
        newStatus,
        pod ? "| con evidencia" : "",
        !debeSetearExternalId && order_code
          ? `| externalId preservado: ${order.externalId}`
          : "",
      );

      // ── Propagar al pack ──
      // Para propagación, buscar por FR- del order_code O del externalId actual
      const frParaPropagar = order.externalId?.startsWith("FR-")
        ? order.externalId
        : order_code?.startsWith("FR-")
          ? order_code
          : null;

      const eventNote = `Actualizado por Moovex · ${status}${ev.receptorName ? ` · Recibió: ${ev.receptorName}` : ""}`;
      await propagarAPack(order.id, frParaPropagar, {
        status: newStatus,
        ...(newStatus === "RECEIVED" && { receivedAt: now }),
        ...(newStatus === "IN_TRANSIT" && { inTransitAt: now }),
        ...(newStatus === "DELIVERED" && {
          deliveredAt: now,
          ...(ev.evidencePhoto1 && { evidencePhoto1: ev.evidencePhoto1 }),
          ...(ev.evidencePhoto2 && { evidencePhoto2: ev.evidencePhoto2 }),
          ...(ev.receptorName && { receptorName: ev.receptorName }),
          ...(ev.receptorRut && { receptorRut: ev.receptorRut }),
          ...(ev.evidenceNote && { evidenceNote: ev.evidenceNote }),
        }),
        eventNote,
      });

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
      console.error(`[Fret webhook] Intento ${attempt}/3 falló:`, err.message);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  console.error(
    "[Fret webhook] Se agotaron los 3 intentos:",
    lastError?.message,
  );
}
