-- DIAGNÓSTICO (solo lectura, no modifica nada): ¿por qué hay pedidos Flex duplicados?
-- Correr en el SQL Editor de Supabase.
--
-- Resultado de la columna "causa":
--   PACK     -> distinto sourceId, mismo envío de ML (compra con varios productos).
--               Lo correcto es 1 pedido con la suma de bultos.
--   CARRERA  -> mismo sourceId repetido (dos avisos del webhook a la vez).
--               Se arregla con un índice único (integrationId, sourceId).

SELECT
  rawPayload_shipping_id                          AS shipping_id,
  COUNT(*)                                        AS pedidos,
  COUNT(DISTINCT "sourceId")                      AS source_ids_distintos,
  CASE WHEN COUNT(DISTINCT "sourceId") = COUNT(*) THEN 'PACK' ELSE 'CARRERA' END AS causa,
  array_agg("orderNumber" ORDER BY "createdAt")   AS pedidos_numeros,
  array_agg("sourceId"    ORDER BY "createdAt")   AS source_ids,
  array_agg("status"      ORDER BY "createdAt")   AS estados,
  MIN("createdAt")                                AS primero,
  MAX("createdAt") - MIN("createdAt")             AS diferencia
FROM (
  SELECT *, "rawPayload"->'shipping'->>'id' AS rawPayload_shipping_id
  FROM orders
  WHERE platform = 'MERCADOLIBRE'
    AND "rawPayload"->'shipping'->>'id' IS NOT NULL
    AND "createdAt" >= now() - interval '14 days'
) o
GROUP BY rawPayload_shipping_id
HAVING COUNT(*) > 1
ORDER BY primero DESC;

-- Mismo sourceId repetido sin importar el envío (carrera pura):
SELECT "integrationId", "sourceId", COUNT(*) AS veces,
       array_agg("orderNumber" ORDER BY "createdAt") AS pedidos
FROM orders
WHERE platform = 'MERCADOLIBRE' AND "sourceId" IS NOT NULL
GROUP BY "integrationId", "sourceId"
HAVING COUNT(*) > 1;
