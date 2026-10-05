import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

// Busca pedidos ML por rawPayload.shipping.id usando el índice
// orders_ml_shipping_id_idx (prisma/sql/2026-10-04_indice_ml_shipping_id.sql).
// El filtro `rawPayload: { path: [...] }` de Prisma no usa índice y recorre
// toda la tabla: con esto el escaneo pasa de segundos a milisegundos.
export async function idsPorShippingId(
  shippingId: string | number,
  opts: { storeId?: string; excluir?: string[] } = {},
): Promise<string[]> {
  const filtros = [
    Prisma.sql`platform = 'MERCADOLIBRE'`,
    Prisma.sql`("rawPayload"->'shipping'->>'id') = ${String(shippingId)}`,
  ];
  if (opts.storeId) filtros.push(Prisma.sql`"storeId" = ${opts.storeId}`);
  if (opts.excluir?.length)
    filtros.push(Prisma.sql`id NOT IN (${Prisma.join(opts.excluir)})`);

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM orders WHERE ${Prisma.join(filtros, " AND ")}`;
  return rows.map((r) => r.id);
}
