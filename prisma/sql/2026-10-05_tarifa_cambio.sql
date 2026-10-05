-- Tarifa fija para pedidos de CAMBIO (retiro + entrega). Aditivo, sin tocar datos.
-- Correr ANTES de desplegar el código: Prisma lee todas las columnas de stores.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS "tarifaCambio" DECIMAL(10,2);

-- Sigan Jugando: cambio $4.990 y retiro $2.990 netos, cualquier zona de cobertura.
-- Revisar que el UPDATE afecte exactamente 1 fila.
UPDATE stores SET "tarifaCambio" = 4990, "tarifaRetiro" = 2990
WHERE name ILIKE 'sigan jugando%';

-- Pedidos ya creados desde "Nuevo pedido" como Cambio/Retiro quedaron sin marca
-- (la ruta descartaba subStoreName); se recuperan por el prefijo de sus notas.
-- Solo Sigan Jugando y solo pedidos creados por un usuario del panel (no API/webhook).
UPDATE orders o
SET "subStoreName" = CASE WHEN o."addressNotes" LIKE '[CAMBIO]%' THEN 'CAMBIO' ELSE 'RETIRO' END
FROM stores s
WHERE s.id = o."storeId"
  AND s.name ILIKE 'sigan jugando%'
  AND o."subStoreName" IS NULL
  AND (o."addressNotes" LIKE '[CAMBIO]%' OR o."addressNotes" LIKE '[RETIRO]%')
  AND EXISTS (
    SELECT 1 FROM order_events e
    WHERE e."orderId" = o.id AND e."createdBy" NOT IN ('api', 'webhook', 'system')
  );
