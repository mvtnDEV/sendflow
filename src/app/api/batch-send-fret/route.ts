export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/utils/auth";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { ok: false, error: "No autorizado" },
      { status: 401 },
    );
  }

  const { orderIds } = await req.json();
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "orderIds requerido" },
      { status: 400 },
    );
  }

  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds }, status: "PENDING" },
    include: {
      store: { select: { id: true, name: true, puntoRetiroFret: true } },
    },
  });

  if (orders.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No hay pedidos PENDING para enviar" },
      { status: 400 },
    );
  }

  const { toFretPayload, createFretOrders } =
    await import("@/lib/services/fret.service");

  const resultados: any[] = [];

  for (const order of orders) {
    try {
      // Verificar si ya tiene externalId externo (Senby)
      const preservarExternalId = !!(
        order.externalId && !order.externalId.startsWith("FR-")
      );

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
        const updateData: any = {
          status: "RECEIVED",
          receivedAt: new Date(),
          events: {
            create: {
              status: "RECEIVED",
              note: "Enviado a Moovex (operador logístico)",
              createdBy: "super-admin",
            },
          },
        };
        if (!preservarExternalId) {
          updateData.externalId = result.created[0].order_code;
        }
        await prisma.order.update({
          where: { id: order.id },
          data: updateData,
        });
        resultados.push({
          orderNumber: order.orderNumber,
          status: "created",
          fr: result.created[0].order_code,
        });
      } else if (result.duplicated[0]) {
        const updateData: any = {
          status: "RECEIVED",
          receivedAt: new Date(),
          events: {
            create: {
              status: "RECEIVED",
              note: "Enviado a Moovex (operador logístico)",
              createdBy: "super-admin",
            },
          },
        };
        if (!preservarExternalId) {
          updateData.externalId = result.duplicated[0].order_code;
        }
        await prisma.order.update({
          where: { id: order.id },
          data: updateData,
        });
        resultados.push({
          orderNumber: order.orderNumber,
          status: "duplicated",
          fr: result.duplicated[0].order_code,
        });
      } else {
        resultados.push({
          orderNumber: order.orderNumber,
          status: "error",
          detail:
            result.rejected?.[0]?.detail ?? result.error ?? "Error desconocido",
        });
      }
    } catch (err: any) {
      resultados.push({
        orderNumber: order.orderNumber,
        status: "error",
        detail: err.message,
      });
    }
  }

  const enviados = resultados.filter(
    (r) => r.status === "created" || r.status === "duplicated",
  ).length;

  return NextResponse.json({
    ok: true,
    enviados,
    total: orders.length,
    resultados,
  });
}
