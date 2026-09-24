export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// ── Saca todos los posibles códigos que puede traer un QR ──
function extraerCandidatos(raw: string): {
  codigos: string[];
  shippingId: string | null;
} {
  const set = new Set<string>();
  let shippingId: string | null = null;
  const add = (v?: string | null) => {
    if (!v) return;
    const t = decodeURIComponent(String(v)).trim();
    if (!t) return;
    set.add(t);
    set.add(t.replace(/^#/, ""));
    set.add(t.toLowerCase());
    set.add(t.toUpperCase());
  };

  add(raw);

  // JSON (etiquetas Flex traen {"id":"480..."})
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.id) add(String(parsed.id));
  } catch {}

  // Link: ?q= / ?id= / ?code= o el último tramo de la ruta
  try {
    const url = new URL(raw);
    for (const k of ["q", "id", "code", "codigo", "qr"])
      add(url.searchParams.get(k));
    const tramos = url.pathname.split("/").filter(Boolean);
    if (tramos.length) add(tramos[tramos.length - 1]);
  } catch {}

  const codigos = [...set].filter((c) => c.length <= 200);

  // Número de envío ML (solo dígitos, para no romper la búsqueda con NaN)
  const numerico = codigos.find((c) => /^\d{8,14}$/.test(c));
  if (numerico) shippingId = numerico;

  return { codigos, shippingId };
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("q")?.trim();
  if (!raw)
    return NextResponse.json(
      { ok: false, error: "Parámetro q requerido" },
      { status: 400 },
    );

  const { codigos, shippingId } = extraerCandidatos(raw);

  const or: any[] = [];
  for (const c of codigos) {
    or.push(
      { id: c },
      { qrCode: c },
      { orderNumber: c },
      { orderNumber: `#${c}` },
      { sourceId: c },
      { externalId: c },
    );
  }
  if (shippingId) {
    or.push({
      rawPayload: { path: ["shipping", "id"], equals: Number(shippingId) },
    });
  }

  const order = await prisma.order.findFirst({
    where: { OR: or },
    orderBy: { createdAt: "asc" },
    include: {
      store: { select: { id: true, name: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!order) {
    console.warn(
      "[driver/scan] No encontrado. QR:",
      raw.slice(0, 200),
      "| candidatos:",
      codigos.slice(0, 8),
    );
    return NextResponse.json(
      { ok: false, error: "Pedido no encontrado", code: raw },
      { status: 404 },
    );
  }

  // ── Pack ML: otras ventas que viajan en la misma caja ──
  let pack: any[] = [];
  const shipId = (order.rawPayload as any)?.shipping?.id;
  if (
    order.platform === "MERCADOLIBRE" &&
    shipId &&
    /^\d+$/.test(String(shipId))
  ) {
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
