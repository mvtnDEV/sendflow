export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

const TIENDAS_FRET = new Set([
  "cmouw44ej0004thpecq6bct35",
  "cmouw23l60003thpe1q7f16r3",
  "cmpbfadyd00032vgl7klna40b",
  "cmpk7nslz0006r5e73du6f0kp",
  "cmovurlze000018duer7sffp4",
  "cmt2181g800072mm41q6pfsb9",
]);

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cincoMinAtras = new Date(Date.now() - 5 * 60 * 1000);

  const orders = await prisma.order.findMany({
    where: {
      status: "PENDING",
      storeId: { in: Array.from(TIENDAS_FRET) },
      createdAt: { lt: cincoMinAtras },
      OR: [
        { externalId: null },
        { externalId: { not: { startsWith: "FR-" } } },
      ],
    },
    include: {
      store: { select: { id: true, name: true, puntoRetiroFret: true } },
    },
    take: 20,
    orderBy: { createdAt: "asc" },
  });

  if (orders.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, sent: 0 });
  }

  console.log(`[Retry Fret] ${orders.length} pedidos sin enviar`);

  const { toFretPayload, createFretOrders } =
    await import("@/lib/services/fret.service");
  const results: any[] = [];
  const shippingEnviados = new Set<string>();

  for (const order of orders) {
    try {
      const shippingId = (order.rawPayload as any)?.shipping?.id;
      const preservar = !!(
        order.externalId && !order.externalId.startsWith("FR-")
      );

      // ── Pack grouping ──
      if (shippingId && order.platform === "MERCADOLIBRE") {
        if (shippingEnviados.has(String(shippingId))) {
          const hermanaResult = results.find(
            (r) => r.shippingId === String(shippingId) && r.fr,
          );
          if (hermanaResult && !preservar) {
            await prisma.order.update({
              where: { id: order.id },
              data: { externalId: hermanaResult.fr },
            });
          }
          results.push({
            orderNumber: order.orderNumber,
            status: "pack_agrupado",
            fr: hermanaResult?.fr,
          });
          continue;
        }

        const hermana = await prisma.order.findFirst({
          where: {
            id: { not: order.id },
            platform: "MERCADOLIBRE",
            externalId: { startsWith: "FR-" },
            rawPayload: {
              path: ["shipping", "id"],
              equals: Number(shippingId),
            },
          },
          select: { externalId: true },
        });

        if (hermana?.externalId) {
          if (!preservar) {
            await prisma.order.update({
              where: { id: order.id },
              data: { externalId: hermana.externalId },
            });
          }
          results.push({
            orderNumber: order.orderNumber,
            status: "pack_existente",
            fr: hermana.externalId,
          });
          continue;
        }

        shippingEnviados.add(String(shippingId));
      }

      const payload = toFretPayload({
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerEmail: order.customerEmail,
        addressStreet: order.addressStreet,
        addressComuna: order.addressComuna,
        addressNotes: order.addressNotes,
        bultos: order.bultos,
        qrCode: order.qrCode,
        sourceId: order.sourceId,
        platform: String(order.platform),
        puntoRetiroFret: order.store?.puntoRetiroFret ?? null,
        subStoreName: order.subStoreName,
        rawPayload: order.rawPayload,
      });

      const result = await createFretOrders([payload]);

      if (result.ok && result.created[0]) {
        if (!preservar) {
          await prisma.order.update({
            where: { id: order.id },
            data: { externalId: result.created[0].order_code },
          });
        }
        console.log(
          "[Retry Fret] ✅",
          order.orderNumber,
          "→",
          result.created[0].order_code,
        );
        results.push({
          orderNumber: order.orderNumber,
          status: "created",
          fr: result.created[0].order_code,
          tienda: order.store?.name,
          shippingId: shippingId ? String(shippingId) : null,
        });
      } else if (result.duplicated[0]) {
        if (!preservar) {
          await prisma.order.update({
            where: { id: order.id },
            data: { externalId: result.duplicated[0].order_code },
          });
        }
        results.push({
          orderNumber: order.orderNumber,
          status: "duplicated",
          fr: result.duplicated[0].order_code,
          tienda: order.store?.name,
        });
      } else {
        console.warn(
          "[Retry Fret] ❌",
          order.orderNumber,
          result.error ?? result.rejected?.[0]?.detail,
        );
        results.push({
          orderNumber: order.orderNumber,
          status: "error",
          detail: result.error ?? result.rejected?.[0]?.detail,
        });
      }
    } catch (err: any) {
      results.push({
        orderNumber: order.orderNumber,
        status: "error",
        detail: err.message,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: orders.length,
    sent: results.filter(
      (r) => r.status === "created" || r.status === "duplicated",
    ).length,
    packs: results.filter((r) => r.status.startsWith("pack_")).length,
    results,
  });
}
