-- Varias cuentas de Mercado Libre por tienda. FASE 2 de 2: correr DESPUÉS de desplegar
-- el código nuevo y ANTES de conectar la segunda cuenta.
--
-- Quita la restricción antigua (storeId, platform): mientras exista, una tienda no puede
-- tener dos integraciones de la misma plataforma. La que vale ahora es
-- (storeId, platform, accountKey), creada en la fase 1.
--
-- Busca la restricción por sus columnas y no por su nombre, porque el nombre depende de
-- cómo se creó la tabla. Si no encuentra ninguna, no hace nada.

DO $$
DECLARE r record;
BEGIN
  -- Como restricción (CONSTRAINT UNIQUE)
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'store_integrations'::regclass
      AND c.contype = 'u'
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
           FROM unnest(c.conkey) k
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k)
          = ARRAY['platform', 'storeId']
  LOOP
    EXECUTE format('ALTER TABLE store_integrations DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'Quitada restricción %', r.conname;
  END LOOP;

  -- Como índice único suelto (así lo crea Prisma)
  FOR r IN
    SELECT i.indexrelid::regclass::text AS idx
    FROM pg_index i
    WHERE i.indrelid = 'store_integrations'::regclass
      AND i.indisunique AND NOT i.indisprimary
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
           FROM unnest(i.indkey::int2[]) k
           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k)
          = ARRAY['platform', 'storeId']
  LOOP
    EXECUTE format('DROP INDEX %s', r.idx);
    RAISE NOTICE 'Quitado índice %', r.idx;
  END LOOP;
END $$;

-- Comprobación: debe quedar SOLO la clave nueva (storeId, platform, accountKey).
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'store_integrations' AND indexdef ILIKE '%UNIQUE%';
