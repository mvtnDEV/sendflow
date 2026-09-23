export const dynamic = "force-dynamic";
export const maxDuration = 300;
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { batchTransitionOrders } from "@/lib/services/order-batch.service";
import { createEnviosNowDeliveriesBatch } from "@/lib/services/enviosnow.service";
import { filtrarParaNow } from "@/lib/config/operadores";

function verifyDriverToken(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const payload = JSON.parse(Buffer.from(auth.slice(7), "base64").toString());
    if (payload.exp < Date.now()) return null;
    if (payload.role !== "DRIVER") return null;
    return payload as { id: string; name: string; storeId: string | null };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const driver = verifyDriverToken(req);
  if (!driver)
    return NextResponse.json(
      { ok: false, error: "No autorizado" },
      { status: 401 },
    );

  const { orderIds } = await req.json().catch(() => ({}));
  if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "orderIds requerido" },
      { status: 400 },
    );
  }

  const now = new Date();
  let enviadosNow = 0;

  try {
    // ── Permitir PENDING, INCIDENT y DELIVERED ──
    // Los Flex pueden llegar a DELIVERED antes de que el conductor
    // los recepcione — el escaneo ocurre temprano en bodega
    const result = await batchTransitionOrders({
      orderIds,
      toStatus: "RECEIVED",
      fromStatuses: ["PENDING", "INCIDENT", "DELIVERED"],
      eventNote: "Recepcionado en bodega vía escaneo batch",
      createdBy: driver.id,
      timestampField: "receivedAt",
    });

    if (result.updated.length > 0) {
      try {
        // ── Solo van a Now los que no son de tiendas Fret ni tienen FR- ──
        const paraNow = await filtrarParaNow(result.updated);
        const saltados = result.updated.length - paraNow.length;
        if (saltados > 0) {
          console.log(
            `[driver batch-receive] ${saltados} pedido(s) no se envían a Now (tienda Fret o ya con FR-)`,
          );
        }

        if (paraNow.length > 0) {
          const successes = await createEnviosNowDeliveriesBatch(paraNow);
          enviadosNow = successes.length;
          if (successes.length > 0) {
            const byId = new Map(result.updated.map((o) => [o.id, o]));
            await prisma.$transaction(
              successes.map((s) =>
                prisma.order.update({
                  where: { id: s.orderId },
                  data: {
                    externalId: s.externalId,
                    ...(!byId.get(s.orderId)?.inTransitAt && {
                      inTransitAt: now,
                    }),
                  },
                }),
              ),
            );
          }
          console.log(
            `[driver batch-receive] Now: ${successes.length}/${paraNow.length} enviados`,
          );
        }
      } catch (err) {
        console.error("[EnviosNow] Error en batch-receive:", err);
      }
    }

    return NextResponse.json({
      ok: true,
      updated: result.updated.length,
      enviadosNow,
    });
  } catch (err) {
    console.error("[batch-receive] Error en batch:", err);
    return NextResponse.json(
      { ok: false, error: "Error recepcionando pedidos" },
      { status: 500 },
    );
  }
}
