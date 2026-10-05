-- Índice para buscar pedidos ML por número de envío (escaneo de etiquetas Flex,
-- packs y webhook de EnviosNow). Sin esto cada escaneo recorre toda la tabla.
-- CONCURRENTLY: no bloquea la tabla mientras se crea (correr fuera de transacción).
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_ml_shipping_id_idx
  ON orders (("rawPayload"->'shipping'->>'id'))
  WHERE platform = 'MERCADOLIBRE';
