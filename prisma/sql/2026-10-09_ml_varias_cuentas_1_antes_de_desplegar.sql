-- Varias cuentas de Mercado Libre por tienda. FASE 1 de 2: correr ANTES de desplegar.
-- Es aditiva: no quita nada, así que el código actual sigue funcionando igual.
-- Prisma lee todas las columnas de store_integrations, por eso va antes del deploy.
--
-- Por qué en dos fases: la restricción actual (storeId, platform) es justo lo que impide
-- tener dos cuentas de ML en una tienda, pero el código viejo todavía hace upsert contra
-- ella. Se quita en la fase 2, cuando el código nuevo ya está desplegado.

-- 1) Columnas nuevas.
--    accountKey: distingue cuentas de una misma plataforma en una tienda. ML = ID de
--    usuario de ML. Las demás plataformas quedan en '' (una sola por tienda).
--    accountLabel: nickname de la cuenta de ML, para mostrarla en Integraciones.
ALTER TABLE store_integrations ADD COLUMN IF NOT EXISTS "accountKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE store_integrations ADD COLUMN IF NOT EXISTS "accountLabel" TEXT;

-- 2) Las cuentas de ML que ya existen pasan a identificarse por su ID de usuario de ML.
UPDATE store_integrations
SET "accountKey" = "externalStoreId"
WHERE platform = 'MERCADOLIBRE' AND "externalStoreId" IS NOT NULL AND "accountKey" = '';

-- 3) Nueva clave única. Convive con la antigua hasta la fase 2.
CREATE UNIQUE INDEX IF NOT EXISTS "store_integrations_storeId_platform_accountKey_key"
  ON store_integrations ("storeId", "platform", "accountKey");

-- 4) Revisión: ¿hay una misma cuenta de ML activa en MÁS de una tienda? Tiene que dar
--    0 filas. Si da alguna, los pedidos de esa cuenta pueden estar cayendo en la tienda
--    equivocada (el webhook toma la primera coincidencia): resolver antes de seguir.
SELECT i."externalStoreId" AS cuenta_ml,
       count(*) AS tiendas,
       array_agg(s.name ORDER BY s.name) AS en_tiendas
FROM store_integrations i
JOIN stores s ON s.id = i."storeId"
WHERE i.platform = 'MERCADOLIBRE' AND i."isActive" AND i."externalStoreId" IS NOT NULL
GROUP BY i."externalStoreId"
HAVING count(*) > 1;

-- 5) Cómo quedaron las cuentas de ML (solo mira).
SELECT s.name AS tienda, i."externalStoreId", i."accountKey", i."accountLabel", i."isActive"
FROM store_integrations i JOIN stores s ON s.id = i."storeId"
WHERE i.platform = 'MERCADOLIBRE'
ORDER BY s.name;
