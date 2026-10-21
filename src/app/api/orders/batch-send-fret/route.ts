export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/utils/auth";
import { prisma } from "@/lib/db/prisma";
import { TIENDAS_PRESERVAN_EXTERNAL_ID } from "@/lib/config/operadores";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { ok: false, error: "No autorizado" },
      { status: 401 },
    );
  }

  const { orderIds, reasignar } = await req.json();
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "orderIds requerido" },
      { status: 400 },
    );
  }

  const orders = await prisma.order.findMany({
    // Normalmente solo pedidos "Creado". Con `reasignar` también los que ya están recepcionados o en
    // camino (por ejemplo, enviados a Now por error): vuelven a "Creado" y se mandan a Fret.
    where: {
      id: { in: orderIds },
      status: { in: reasignar ? ["PENDING", "RECEIVED", "IN_TRANSIT"] : ["PENDING"] },
    },
    include: {
      store: { select: { id: true, name: true, puntoRetiroFret: true } },
    },
  });

  if (orders.length === 0) {
    return NextResponse.json(
      { ok: false, error: reasignar ? "No hay pedidos que se puedan enviar a Fret" : "No hay pedidos PENDING para enviar" },
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

      // Pedido que ya estaba recepcionado o en camino: se devuelve a "Creado" y queda en Fret
      // (pasa a "Recepcionado" cuando Fret avise por webhook que lo retiró).
      const reasignado = order.status !== "PENDING";
      const marcarEnviado = async (orderCode: string) => {
        const data: any = {
          events: {
            create: {
              status: "PENDING",
              note: reasignado
                ? `Reasignado a Fret (estaba ${order.status === "IN_TRANSIT" ? "en camino" : "recepcionado"}): vuelve a Creado`
                : "Enviado a Moovex (operador logístico)",
              createdBy: "super-admin",
            },
          },
        };
        if (reasignado) {
          data.status = "PENDING";
          data.inTransitAt = null;
          data.receivedAt = null;
        }
        // El ID de Senby nunca se pisa; en el resto, un pedido reasignado deja de apuntar al ID del otro operador
        if (!preservarExternalId || (reasignado && !TIENDAS_PRESERVAN_EXTERNAL_ID.has(order.storeId))) {
          data.externalId = orderCode;
        }
        await prisma.order.update({ where: { id: order.id }, data });
      };

      const result = await createFretOrders([payload]);

      if (result.ok && result.created[0]) {
        await marcarEnviado(result.created[0].order_code);
        resultados.push({
          orderNumber: order.orderNumber,
          status: "created",
          fr: result.created[0].order_code,
        });
      } else if (result.duplicated[0]) {
        await marcarEnviado(result.duplicated[0].order_code);
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