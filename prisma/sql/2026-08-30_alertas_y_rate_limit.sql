-- Mejoras 1 y 2 — alertas + tracking publico con rate limiting.
--
-- COMO APLICARLO: pegar este archivo completo en el SQL Editor de Supabase.
-- NO usar `prisma db push` contra produccion (ver nota al final).
--
-- Es 100% aditivo y verificado: solo CREATE TYPE / CREATE TABLE / CREATE INDEX.
-- No hay un solo ALTER, DROP ni RENAME. No toca ninguna tabla existente.
--
-- Generado con:
--   prisma migrate diff --from-schema-datamodel <schema en 7251413, con el
--   @map("created_at") de LoginAttempt ya aplicado> --to-schema-datamodel
--   prisma/schema.prisma --script

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('FLEX_CANCELLED', 'STUCK_IN_TRANSIT', 'NOT_SENT_TO_FRET', 'FRET_NOT_PICKED_UP');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'RESOLVED');

-- CreateTable
CREATE TABLE "rate_limit_hits" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "dedupeKey" TEXT NOT NULL,
    "orderId" TEXT,
    "orderNumber" TEXT,
    "storeId" TEXT,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "metadata" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolvedNote" TEXT,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rate_limit_hits_bucket_createdAt_idx" ON "rate_limit_hits"("bucket", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_dedupeKey_key" ON "alerts"("dedupeKey");

-- CreateIndex
CREATE INDEX "alerts_status_type_idx" ON "alerts"("status", "type");

-- CreateIndex
CREATE INDEX "alerts_storeId_status_idx" ON "alerts"("storeId", "status");


-- ─────────────────────────────────────────────────────────────────────────────
-- ANTES DE CORRER CUALQUIER `prisma db push` EN PRODUCCION, leer esto.
--
-- El schema.prisma no describe del todo dos tablas que se crearon a mano:
--   * login_attempts  -> la columna real es `created_at`. Ya quedo corregido en
--                        el schema con @map("created_at").
--   * api_rate_limits -> el codigo viejo consultaba una columna `key` que el
--                        modelo no declara. Esa tabla ya no la usa nadie
--                        (la reemplaza rate_limit_hits), pero sigue declarada
--                        para que un push no la borre.
--
-- Para confirmar como estan de verdad, correr esta consulta de solo lectura:
--
--   SELECT table_name, column_name, data_type
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name IN ('login_attempts', 'api_rate_limits')
--   ORDER BY table_name, ordinal_position;
--
-- Si login_attempts trae `created_at`, el schema ya quedo correcto.
-- ─────────────────────────────────────────────────────────────────────────────
