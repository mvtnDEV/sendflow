export const dynamic = "force-dynamic";
export const maxDuration = 300;
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decrypt, encrypt } from "@/lib/utils/crypto";
import { refreshMLToken } from "@/lib/integrations/mercadolibre";
import { getSessionUser } from "@/lib/utils/auth";

/**
 * GET /api/debug/sync-ml?store=<nombre>&days=7[&confirmar=1][&todos=1]
 *
 * Trae a Moovex los pedidos de Mercado Libre de una tienda que existían ANTES de
 * conectarla (el webhook solo avisa de lo nuevo). Solo SUPER_ADMIN, desde el
 * navegador con la sesión iniciada.
 *
 * - Sin `confirmar=1` es una VISTA PREVIA: lista lo que se crearía y no crea nada.
 * - Solo importa envíos Flex (logistic_type self_service) que todavía no salen:
 *   ready_to_ship / handling / pending. Lo entregado, en ruta o cancelado se
 *   omite, para no facturar pedidos que Moovex no despachó. `todos=1` quita el
 *   filtro de Flex (no el de estado).
 */
const PENDIENTES = ["ready_to_ship", "handling", "pending"];
const MAX_PEDIDOS = 1000;

async function getToken(integration: { id: string; apiKeyEnc: string }) {
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
  const test = await fetch("https://api.mercadolibre.com/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (test.status !== 401 && test.status !== 403) return accessToken;

  const refreshed = await refreshMLToken(refreshToken);
  await prisma.storeIntegration.update({
    where: { id: integration.id },
    data: {
      apiKeyEnc: encrypt(`${refreshed.accessToken}|${refreshed.refreshToken}`),
      refreshToken: refreshed.refreshToken,
      lastSyncAt: new Date(),
    },
  });
  return refreshed.accessToken;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const storeName = (params.get("store") ?? "").trim();
  const days = Math.min(30, Math.max(1, parseInt(params.get("days") ?? "7") || 7));
  const confirmar = params.get("confirmar") === "1";
  const soloFlex = params.get("todos") !== "1";

  if (!storeName) {
    return NextResponse.json({ error: "Falta ?store=<nombre de la tienda>" }, { status: 400 });
  }

  const integration = await prisma.storeIntegration.findFirst({
    where: {
      platform: "MERCADOLIBRE",
      isActive: true,
      store: { name: { equals: storeName, mode: "insensitive" } },
    },
    select: { id: true, storeId: true, apiKeyEnc: true, store: { select: { name: true } } },
  });
  if (!integration) {
    return NextResponse.json({ error: `No hay integración ML activa para la tienda "${storeName}"` }, { status: 404 });
  }

  let token: string;
  try {
    token = await getToken(integration);
  } catch (err: any) {
    return NextResponse.json({ error: "No se pudo obtener el token de ML", detail: err.message }, { status: 502 });
  }

  const meRes = await fetch("https://api.mercadolibre.com/users/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meRes.ok) {
    return NextResponse.json({ error: "Token de ML inválido", status: meRes.status }, { status: 502 });
  }
  const mlUser = await meRes.json();

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
      results.push({ status: "error", detail: `orders/search HTTP ${ordersRes.status}` });
      break;
    }
    const ordersData = await ordersRes.json();
    total = ordersData.paging?.total ?? 0;

    for (const mlOrder of ordersData.results ?? []) {
      const orderId = String(mlOrder.id);

      const existing = await prisma.order.findFirst({
        where: { storeId: integration.storeId, sourceId: orderId },
        select: { orderNumber: true, status: true },
      });
      if (existing) {
        results.push({ orderId, status: "ya_existe", orderNumber: existing.orderNumber, estado: existing.status });
        continue;
      }
      if (mlOrder.status === "cancelled") {
        results.push({ orderId, status: "omitido", motivo: "orden cancelada" });
        continue;
      }

      const shippingId = mlOrder.shipping?.id;
      let shipment: any = null;
      if (shippingId) {
        try {
          const shipRes = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (shipRes.ok) shipment = await shipRes.json();
        } catch {}
      }
      if (!shipment) {
        results.push({ orderId, status: "omitido", motivo: "sin envío" });
        continue;
      }
      if (soloFlex && shipment.logistic_type !== "self_service") {
        results.push({ orderId, status: "omitido", motivo: `no es Flex (${shipment.logistic_type ?? "?"})` });
        continue;
      }
      if (!PENDIENTES.includes(shipment.status)) {
        results.push({ orderId, status: "omitido", motivo: `envío ${shipment.status}/${shipment.substatus ?? "-"}` });
        continue;
      }

      let addressStreet = "Sin dirección";
      let addressComuna = "Sin comuna";
      let addressRegion = "Región Metropolitana";
      let addressNotes = "";
      if (shipment.receiver_address) {
        const addr = shipment.receiver_address;
        addressStreet = [addr.street_name, addr.street_number].filter(Boolean).join(" ");
        addressComuna = addr.city?.name ?? addr.municipality?.name ?? "Sin comuna";
        addressRegion = addr.state?.name ?? "Región Metropolitana";
        if (addr.comment) addressNotes = addr.comment;
      }
      const buyer = mlOrder.buyer ?? {};
      const bultos = (mlOrder.order_items ?? []).reduce(
        (sum: number, item: any) => sum + (item.quantity ?? 1), 0,
      ) || 1;
      const customerName = `${buyer.first_name ?? ""} ${buyer.last_name ?? ""}`.trim() || "Cliente ML";

      if (!confirmar) {
        results.push({ orderId, status: "se_crearia", cliente: customerName, comuna: addressComuna, envio: `${shipment.status}/${shipment.substatus ?? "-"}` });
        continue;
      }

      try {
        const { createOrder } = await import("@/lib/services/order.service");
        const order = await createOrder({
          storeId: integration.storeId,
          integrationId: integration.id,
          platform: "MERCADOLIBRE",
          sourceId: orderId,
          customerName,
          customerPhone: buyer.phone?.number ?? null,
          customerEmail: buyer.email ?? null,
          addressStreet,
          addressComuna,
          addressRegion,
          addressNotes,
          bultos,
          rawPayload: { ...mlOrder, shipping: shipment, pack_id: mlOrder.pack_id },
          createdBy: "sync-ml",
        });
        results.push({ orderId, status: "creado", orderNumber: order.orderNumber, cliente: customerName, comuna: addressComuna });
      } catch (err: any) {
        if (err.code === "P2002") results.push({ orderId, status: "ya_existe" });
        else results.push({ orderId, status: "error", detail: err.message });
      }
    }

    offset += 50;
  } while (offset < total && offset < MAX_PEDIDOS);

  const cuenta = (s: string) => results.filter((r) => r.status === s).length;
  return NextResponse.json({
    ok: true,
    modo: confirmar ? "IMPORTADO" : "VISTA PREVIA (agrega &confirmar=1 para crear)",
    store: integration.store.name,
    dias: days,
    totalML: total,
    resumen: {
      creados: cuenta("creado"),
      se_crearian: cuenta("se_crearia"),
      ya_existian: cuenta("ya_existe"),
      omitidos: cuenta("omitido"),
      errores: cuenta("error"),
    },
    results,
  });
}
