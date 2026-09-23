export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("q")?.trim();
  if (!raw)
    return NextResponse.json(
      { ok: false, error: "Parámetro q requerido" },
      { status: 400 },
    );

  let q = raw;
  let shippingId: string | null = null;

  // ── Etiqueta Flex: el QR trae un JSON con el shipping id ──
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.id) {
      q = String(parsed.id);
      shippingId = String(parsed.id);
    }
  } catch {}

  // ── Ingreso manual de un número de envío ML (11 dígitos) ──
  if (!shippingId && /^\d{10,12}$/.test(q)) shippingId = q;

  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { id: q },
        { qrCode: q },
        { orderNumber: q },
        { orderNumber: `#${q}` },
        { sourceId: q },
        { externalId: q },
        ...(shippingId
          ? [
              {
                rawPayload: {
                  path: ["shipping", "id"],
                  equals: Number(shippingId),
                },
              },
            ]
          : []),
      ],
    },
    orderBy: { createdAt: "asc" },
    include: {
      store: { select: { id: true, name: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!order)
    return NextResponse.json(
      { ok: false, error: "Pedido no encontrado", code: q },
      { status: 404 },
    );

  // ── Pack ML: otras ventas que viajan en la misma caja (mismo shipping id) ──
  let pack: any[] = [];
  const shipId = (order.rawPayload as any)?.shipping?.id;
  if (order.platform === "MERCADOLIBRE" && shipId) {
    pack = await prisma.order.findMany({
      where: {
        id: { not: order.id },
        storeId: order.storeId,
        platform: "MERCADOLIBRE",
        rawPayload: { path: ["shipping", "id"], equals: Number(shipId) },
      },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        addressStreet: true,
        addressComuna: true,
        bultos: true,
        status: true,
        storeId: true,
        store: { select: { name: true } },
      },
    });
  }

  return NextResponse.json({ ok: true, data: order, pack });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}
