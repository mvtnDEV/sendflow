export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decrypt } from "@/lib/utils/crypto";

export async function GET(req: NextRequest) {
  const storeName = req.nextUrl.searchParams.get("store") ?? "";
  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "3");

  const integration = await prisma.storeIntegration.findFirst({
    where: { platform: "MERCADOLIBRE", isActive: true, store: { name: storeName } },
    include: { store: { select: { name: true, puntoRetiroFret: true } } },
  });

  if (!integration) return NextResponse.json({ error: "no integration" });

  let token: string;
  try {
    const decrypted = decrypt(integration.apiKeyEnc);
    token = decrypted.includes("|") ? decrypted.split("|")[0] : decrypted;
  } catch {
    return NextResponse.json({ error: "decrypt failed" });
  }

  const testRes = await fetch("https://api.mercadolibre.com/users/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!testRes.ok) {
    return NextResponse.json({ error: "token expired", status: testRes.status });
  }
  const mlUser = await testRes.json();

  const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const results: any[] = [];
  let offset = 0;
  let total = 0;

  do {
    const ordersRes = await fetch(
      `https://api.mercadolibre.com/orders/search?seller=${mlUser.id}&order.date_created.from=${dateFrom}&sort=date_desc&offset=${offset}&limit=50`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!ordersRes.ok) {
      results.push({ error: "orders search failed", status: ordersRes.status });
      break;
    }

    const ordersData = await ordersRes.json();
    total = ordersData.paging?.total ?? 0;
    const orders = ordersData.results ?? [];

    for (const mlOrder of orders) {
      const orderId = String(mlOrder.id);

      const existing = await prisma.order.findFirst({
        where: { integrationId: integration.id, sourceId: orderId },
        select: { id: true, orderNumber: true, customerName: true, addressStreet: true, addressComuna: true, externalId: true, status: true },
      });

      if (existing) {
        results.push({
          orderId,
          status: "ya_existe",
          orderNumber: existing.orderNumber,
          cliente: existing.customerName,
          direccion: existing.addressStreet,
          comuna: existing.addressComuna,
          fret: existing.externalId,
          estado: existing.status,
        });
        continue;
      }

      if (mlOrder.status === "cancelled") {
        results.push({ orderId, status: "cancelado" });
        continue;
      }

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
      if (shipmentStatus === "cancelled") {
        results.push({ orderId, status: "envio_cancelado" });
        continue;
      }

      let addressStreet = "Sin dirección";
      let addressComuna = "Sin comuna";
      let addressRegion = "Región Metropolitana";
      let addressNotes = "";

      if (shipment?.receiver_address) {
        const addr = shipment.receiver_address;
        addressStreet = [addr.street_name, addr.street_number].filter(Boolean).join(" ");
        addressComuna = addr.city?.name ?? addr.municipality?.name ?? "Sin comuna";
        addressRegion = addr.state?.name ?? "Región Metropolitana";
        if (addr.comment) addressNotes = addr.comment;
      }

      const buyer = mlOrder.buyer ?? {};
      const items = mlOrder.order_items ?? [];
      const totalBultos = items.reduce(
        (sum: number, item: any) => sum + (item.quantity ?? 1), 0,
      );

      try {
        const { createOrder } = await import("@/lib/services/order.service");
        const order = await createOrder({
          storeId: integration.storeId,
          integrationId: integration.id,
          platform: "MERCADOLIBRE",
          sourceId: orderId,
          customerName:
            `${buyer.first_name ?? ""} ${buyer.last_name ?? ""}`.trim() || "Cliente ML",
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
          createdBy: "sync-ml",
        });

        results.push({
          orderId,
          status: "creado",
          orderNumber: order.orderNumber,
          cliente: order.customerName,
          direccion: addressStreet,
          comuna: addressComuna,
        });
      } catch (err: any) {
        results.push({ orderId, status: "error", detail: err.message });
      }
    }

    offset += 50;
  } while (offset < total && offset < 200);

  const creados = results.filter(r => r.status === "creado").length;
  const existentes = results.filter(r => r.status === "ya_existe").length;

  return NextResponse.json({
    ok: true,
    store: storeName,
    mlUser: mlUser.id,
    totalML: total,
    creados,
    existentes,
    results,
  });
}
