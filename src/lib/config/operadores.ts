import { prisma } from "@/lib/db/prisma";

// ── Tiendas que SIGUEN con Fret ──
// Todo lo que NO esté acá y se recepcione en bodega se envía a Envios Now.
// El jueves, cuando todas pasen a Now, se vacía este Set y listo.
export const TIENDAS_FRET_ACTIVAS = new Set<string>([
  "cmouw44ej0004thpecq6bct35", // Eco pañal
  "cmouw23l60003thpe1q7f16r3", // Oasis verde
  "cmpbfadyd00032vgl7klna40b", // Fire Master
  "cmovurlze000018duer7sffp4", // Protec
  "cmt2181g800072mm41q6pfsb9", // Sigan Jugando
  // Comercial Bess salió de Fret → Now
]);

/**
 * De una lista de pedidos recién recepcionados, devuelve solo los que
 * deben ir a Envios Now:
 *  - la tienda NO está en TIENDAS_FRET_ACTIVAS
 *  - el pedido NO tiene ya un código FR- (esos siguen su curso en Fret)
 */
export async function filtrarParaNow<T extends { id: string }>(
  pedidos: T[],
): Promise<T[]> {
  if (pedidos.length === 0) return [];

  const info = await prisma.order.findMany({
    where: { id: { in: pedidos.map((p) => p.id) } },
    select: { id: true, storeId: true, externalId: true },
  });
  const byId = new Map(info.map((o) => [o.id, o]));

  return pedidos.filter((p) => {
    const o = byId.get(p.id);
    if (!o) return false;
    if (TIENDAS_FRET_ACTIVAS.has(o.storeId)) return false;
    if (o.externalId?.startsWith("FR-")) return false;
    return true;
  });
}
