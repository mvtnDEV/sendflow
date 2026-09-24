export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/utils/auth";
import { prisma } from "@/lib/db/prisma";
import { enviarPedidosANow } from "@/lib/services/now-dispatch.service";

// POST /api/orders/[id]/send-enviosnow — botón "Enviar a Now" del panel
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser();
  if (!user || user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { ok: false, error: "No autorizado" },
      { status: 401 },
    );
  }

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    select: { id: true, orderNumber: true, externalId: true },
  });
  if (!order) {
    return NextResponse.json(
      { ok: false, error: "Pedido no encontrado" },
      { status: 404 },
    );
  }

  try {
    // Usa el mismo envío que la app: agrupa packs y no pisa el ID de Senby
    const r = await enviarPedidosANow([order.id]);
    if (r.errores.length > 0) {
      return NextResponse.json({ ok: false, error: r.errores[0].error });
    }
    const actualizado = await prisma.order.findUnique({
      where: { id: order.id },
      select: { externalId: true },
    });
    return NextResponse.json({ ok: true, id: actualizado?.externalId ?? null });
  } catch (err: any) {
    console.error("[send-enviosnow]", err);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 },
    );
  }
}
