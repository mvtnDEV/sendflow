-- Evita pedidos Shopify duplicados cuando Shopify entrega el mismo webhook dos
-- veces al mismo tiempo (upsertOrderFromWebhook captura el P2002 y devuelve el
-- pedido que ya existía).
--
-- COMO APLICARLO: en el SQL Editor de Supabase, en dos pasos.
-- NO usar `prisma db push` contra produccion: Prisma no conoce índices
-- parciales y lo borraría.
--
-- Es aditivo: solo crea un índice. Solo afecta a pedidos SHOPIFY, así que no
-- cambia nada para ML, WooCommerce, Jumpseller ni pedidos manuales.

-- ─── PASO 1: revisar que no haya duplicados ya guardados ─────────────────────
-- Debe devolver 0 filas. Si devuelve alguna, hay que anular/eliminar el pedido
-- sobrante antes del paso 2 (el índice no se puede crear con duplicados).
SELECT "integrationId", "sourceId", COUNT(*) AS veces,
       array_agg("orderNumber" ORDER BY "createdAt") AS pedidos
FROM orders
WHERE platform = 'SHOPIFY' AND "sourceId" IS NOT NULL
GROUP BY "integrationId", "sourceId"
HAVING COUNT(*) > 1;

-- ─── PASO 2: crear el índice ─────────────────────────────────────────────────
-- Sin CONCURRENTLY: el SQL Editor de Supabase corre todo en una transacción y
-- no lo permite. Bloquea escrituras en orders solo los segundos que tarda.
CREATE UNIQUE INDEX IF NOT EXISTS orders_shopify_source_unique
  ON orders ("integrationId", "sourceId")
  WHERE platform = 'SHOPIFY' AND "sourceId" IS NOT NULL;
