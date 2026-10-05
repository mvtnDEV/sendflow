-- Tarifa fija para pedidos de CAMBIO (retiro + entrega). Aditivo, sin tocar datos.
-- Correr ANTES de desplegar el código: Prisma lee todas las columnas de stores.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS "tarifaCambio" DECIMAL(10,2);

-- Sigan Jugando: cambio $4.990 y retiro $2.990 netos, cualquier zona de cobertura.
-- Revisar que el UPDATE afecte exactamente 1 fila.
UPDATE stores SET "tarifaCambio" = 4990, "tarifaRetiro" = 2990
WHERE name ILIKE 'sigan jugando%';
