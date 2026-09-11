export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decrypt } from "@/lib/utils/crypto";

export async function GET(req: NextRequest) {
  const storeName = req.nextUrl.searchParams.get("store") ?? "";

  const integration = await prisma.storeIntegration.findFirst({
    where: { platform: "MERCADOLIBRE", isActive: true, store: { name: storeName } },
    include: { store: { select: { name: true } } },
  });
  if (!integration) return NextResponse.json({ error: "no integration" });

  let token: string;
  try {
    const decrypted = decrypt(integration.apiKeyEnc);
    token = decrypted.includes("|") ? decrypted.split("|")[0] : decrypted;
  } catch {
    return NextResponse.json({ error: "decrypt failed" });
  }

  const orders = await prisma.order.findMany({
    where: {
      integrationId: integration.id,
      customerName: "Cliente ML",
      sourceId: { not: null },
    },
    select: { id: true, orderNumber: true, sourceId: true, addressStreet: true, addressComuna: true },
    take: 50,
  });

  if (orders.length === 0) {
    return NextResponse.json({ ok: true, message: "No hay pedidos con Cliente ML", fixed: 0 });
  }

  const results: any[] = [];

  for (const order of orders) {
    try {
      const res = await fetch(
        `https://api.mercadolibre.com/orders/${order.sourceId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!res.ok) {
        results.push({ orderNumber: order.orderNumber, status: "error_ml", code: res.status });
        continue;
      }

      const mlOrder = await res.json();
      const buyer = mlOrder.buyer ?? {};
      const name = `${buyer.first_name ?? ""} ${buyer.last_name ?? ""}`.trim();

      if (!name || name === "Cliente ML") {
        results.push({ orderNumber: order.orderNumber, status: "sin_nombre" });
        continue;
      }

      // ── Actualizar dirección también si está vacía ──
      const shippingId = mlOrder.shipping?.id;
      let updateData: any = {
        customerName: name,
        customerPhone: buyer.phone?.number ?? null,
        customerEmail: buyer.email ?? null,
      };

      if (shippingId && (order.addressStreet === "Sin dirección" || order.addressComuna === "Sin comuna")) {
        try {
          const shipRes = await fetch(
            `https://api.mercadolibre.com/shipments/${shippingId}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (shipRes.ok) {
            const shipment = await shipRes.json();
            const addr = shipment.receiver_address;
            if (addr) {
              updateData.addressStreet = [addr.street_name, addr.street_number].filter(Boolean).join(" ");
              updateData.addressComuna = addr.city?.name ?? addr.municipality?.name ?? order.addressComuna;
            }
          }
        } catch {}
      }

      await prisma.order.update({
        where: { id: order.id },
        data: updateData,
      });

      results.push({
        orderNumber: order.orderNumber,
        status: "corregido",
        nombre: name,
        direccion: updateData.addressStreet ?? order.addressStreet,
        comuna: updateData.addressComuna ?? order.addressComuna,
      });
    } catch (err: any) {
      results.push({ orderNumber: order.orderNumber, status: "error", detail: err.message });
    }
  }

  const fixed = results.filter(r => r.status === "corregido").length;

  return NextResponse.json({
    ok: true,
    store: storeName,
    total: orders.length,
    fixed,
    results,
  });
}
