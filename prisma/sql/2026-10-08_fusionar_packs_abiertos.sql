-- Fusiona packs de Mercado Libre que quedaron separados (varios pedidos, 1 envío)
-- en UN pedido (el más antiguo), sumando bultos. Solo 3 envíos, desde el 30-sep.
--
--   48202274886  Jean Marc van Kilsdonk (Comercial Bess)  EN CAMINO
--   48202636807  David Raúl Luco (Fire master)             NO ENTREGADO
--   48139382139  Valeria Paredes (Comercial Bess)          NO ENTREGADO
--
-- COMO APLICARLO: SQL Editor de Supabase, un paso por consulta (el editor solo
-- muestra el resultado de la última sentencia): 0, 1, 2 y 3, en ese orden.
-- Si cualquier envío no cumple las condiciones, el paso 2 aborta COMPLETO y no
-- cambia nada. Los pedidos secundarios se respaldan antes de borrarse (paso 1/2)
-- y se pueden restaurar (paso 4).

-- ─── PASO 0 (solo lectura): revisar lo que se va a fusionar ──────────────────
SELECT "rawPayload"->'shipping'->>'id' AS envio, "orderNumber", status, bultos,
       "sourceId", "externalId", "createdAt"
FROM orders
WHERE platform = 'MERCADOLIBRE'
  AND "rawPayload"->'shipping'->>'id' IN ('48202274886','48202636807','48139382139')
ORDER BY envio, "createdAt";

-- ─── PASO 1: tablas de respaldo (se corre una sola vez) ──────────────────────
CREATE TABLE IF NOT EXISTS orders_fusion_backup AS TABLE orders WITH NO DATA;
CREATE TABLE IF NOT EXISTS order_events_fusion_backup AS TABLE order_events WITH NO DATA;
ALTER TABLE orders_fusion_backup
  ADD COLUMN IF NOT EXISTS fusionado_en timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS principal_id text;
-- Datos personales de clientes: sin RLS la API REST pública de Supabase (clave
-- anon) podría leerlas. Sin políticas = nadie vía API; Prisma/postgres no se afecta.
ALTER TABLE orders_fusion_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events_fusion_backup ENABLE ROW LEVEL SECURITY;

-- ─── PASO 2: fusión (todo o nada) ────────────────────────────────────────────
DO $$
DECLARE
  envio      text;
  envios     text[] := ARRAY['48202274886','48202636807','48139382139'];
  principal  orders%ROWTYPE;
  n          int;
  extra      int;
  sec_ids    text[];
  sec_nums   text;
  pack       jsonb;
  ext        text;
  shipped    timestamp;
BEGIN
  FOREACH envio IN ARRAY envios LOOP
    SELECT * INTO principal FROM orders
     WHERE platform = 'MERCADOLIBRE'
       AND "rawPayload"->'shipping'->>'id' = envio
     ORDER BY "createdAt", id LIMIT 1;
    IF principal.id IS NULL THEN
      RAISE EXCEPTION 'Envío %: no se encontró ningún pedido', envio;
    END IF;

    -- Validaciones: mismo envío+tienda, ≥2 pedidos, todos desde el 30-sep (00:00 Chile),
    -- todos en el mismo estado EN CAMINO o NO ENTREGADO, y ninguno fusionado antes.
    SELECT count(*) INTO n FROM orders
     WHERE platform = 'MERCADOLIBRE'
       AND "rawPayload"->'shipping'->>'id' = envio
       AND "storeId" = principal."storeId"
       AND "createdAt" >= TIMESTAMP '2026-09-30 03:00:00'
       AND status = principal.status
       AND principal.status IN ('IN_TRANSIT', 'INCIDENT')
       AND "sourceId" IS NOT NULL
       AND NOT (COALESCE("rawPayload"->'pack_orders', '[]'::jsonb) <> '[]'::jsonb);
    SELECT count(*) INTO extra FROM orders
     WHERE platform = 'MERCADOLIBRE'
       AND "rawPayload"->'shipping'->>'id' = envio;
    IF n < 2 OR n <> extra THEN
      RAISE EXCEPTION 'Envío % no cumple las condiciones (válidos: %, totales: %). No se cambió nada.',
        envio, n, extra;
    END IF;

    SELECT array_agg(id ORDER BY "createdAt", id), string_agg("orderNumber", ', ' ORDER BY "createdAt", id),
           COALESCE(principal."externalId", max("externalId")),
           COALESCE(principal."mlShippedAt", max("mlShippedAt"))
      INTO sec_ids, sec_nums, ext, shipped
      FROM orders
     WHERE platform = 'MERCADOLIBRE'
       AND "rawPayload"->'shipping'->>'id' = envio
       AND id <> principal.id;

    -- Datos de las órdenes absorbidas, para que los avisos futuros de ML las reconozcan
    SELECT jsonb_agg(jsonb_build_object(
             'sourceId', s."sourceId",
             'bultos',   s.bultos,
             'items',    CASE WHEN jsonb_typeof(s."rawPayload"->'order_items') = 'array' THEN
                           (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                     'title', i->'item'->>'title',
                                     'quantity', COALESCE((i->>'quantity')::int, 1))), '[]'::jsonb)
                              FROM jsonb_array_elements(s."rawPayload"->'order_items') i)
                         ELSE '[]'::jsonb END,
             'fusionado', true) ORDER BY s."createdAt", s.id)
      INTO pack
      FROM orders s WHERE s.id = ANY(sec_ids);

    -- Respaldo de secundarios y de sus historiales
    INSERT INTO orders_fusion_backup SELECT o.*, now(), principal.id FROM orders o WHERE o.id = ANY(sec_ids);
    INSERT INTO order_events_fusion_backup SELECT e.* FROM order_events e WHERE e."orderId" = ANY(sec_ids);

    -- Principal: bultos sumados + datos del pack + historial
    UPDATE orders
       SET bultos = bultos + (SELECT COALESCE(sum(bultos), 0) FROM orders WHERE id = ANY(sec_ids)),
           "rawPayload" = jsonb_set(COALESCE("rawPayload", '{}'::jsonb), '{pack_orders}', pack),
           "externalId" = ext,
           "mlShippedAt" = shipped,
           "updatedAt" = now()
     WHERE id = principal.id;

    INSERT INTO order_events (id, "orderId", status, note, "createdBy")
    VALUES ('fus_' || md5(random()::text || clock_timestamp()::text), principal.id, principal.status,
            'Pack ML fusionado: se sumaron ' || array_length(sec_ids, 1) || ' pedido(s) (' || sec_nums || ')',
            'fusion-packs');

    -- Borrar secundarios (su historial se elimina en cascada; ya está respaldado)
    DELETE FROM orders WHERE id = ANY(sec_ids);

    RAISE NOTICE 'Envío %: % fusionado(s) en %', envio, array_length(sec_ids, 1), principal."orderNumber";
  END LOOP;
END $$;

-- ─── PASO 3 (solo lectura): comprobar el resultado ───────────────────────────
SELECT "orderNumber", status, bultos, "externalId",
       jsonb_array_length("rawPayload"->'pack_orders') AS ordenes_extra
FROM orders
WHERE platform = 'MERCADOLIBRE'
  AND "rawPayload"->'shipping'->>'id' IN ('48202274886','48202636807','48139382139');
-- Esperado: 3 filas (1 por envío), con bultos 2 / 3 / 5 y ordenes_extra 1 / 1 / 3.

-- ─── PASO 4 (solo si hay que deshacer): restaurar secundarios ────────────────
-- Devuelve los pedidos y sus historiales borrados. Después hay que restar los
-- bultos y quitar pack_orders del principal (avísame y lo preparo con tus datos).
-- CREATE TEMP TABLE t_restaurar AS SELECT * FROM orders_fusion_backup;
-- ALTER TABLE t_restaurar DROP COLUMN fusionado_en, DROP COLUMN principal_id;
-- INSERT INTO orders SELECT * FROM t_restaurar;
-- INSERT INTO order_events SELECT * FROM order_events_fusion_backup;
