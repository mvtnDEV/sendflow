-- Un solo pedido de Mercado Libre por envío (shipping.id) y tienda.
--
-- Las órdenes de un pack llegan al webhook con milisegundos de diferencia; sin
-- esto dos webhooks pueden crear cada uno su pedido. Con el índice, el segundo
-- INSERT falla (P2002) y el webhook suma sus bultos al pedido que ya existe
-- (src/lib/services/ml-pack.service.ts).
--
-- ⚠ ORDEN DE ACTIVACIÓN (importante):
--   1. Publicar el código nuevo (con ML_AGRUPAR_PACKS sin definir: no cambia nada).
--   2. Definir ML_AGRUPAR_PACKS=1 en Vercel y redeploy.
--   3. Recién ahí correr este SQL.
--   Si el índice existe y ML_AGRUPAR_PACKS está apagado, la segunda orden de un
--   pack NO se crea (el webhook la toma como "ya existe"): se perdería un producto.
--   Para volver atrás: DROP INDEX orders_ml_un_pedido_por_envio;
--
-- Es aditivo y no toca los duplicados históricos: el índice solo vale para pedidos
-- creados desde la fecha de corte (los ~80 packs ya separados quedan como están).
--
-- COMO APLICARLO: SQL Editor de Supabase, sin CONCURRENTLY (corre en transacción;
-- bloquea escrituras en orders solo unos segundos).

-- ─── PASO 1: obtener la fecha de corte (UTC, ahora) ──────────────────────────
SELECT now() AT TIME ZONE 'utc' AS fecha_corte;

-- ─── PASO 2: reemplazar '2026-10-09 00:00:00' por la fecha_corte del paso 1 ───
CREATE UNIQUE INDEX IF NOT EXISTS orders_ml_un_pedido_por_envio
  ON orders ("storeId", (("rawPayload"->'shipping'->>'id')))
  WHERE platform = 'MERCADOLIBRE'
    AND "rawPayload"->'shipping'->>'id' IS NOT NULL
    AND "createdAt" >= TIMESTAMP '2026-10-09 00:00:00';
