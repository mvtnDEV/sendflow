-- Mejoras 1 y 2 (alertas + tracking publico con rate limit).
-- Generado con: prisma migrate diff --from-schema-datamodel <schema en 7251413> --to-schema-datamodel prisma/schema.prisma --script
--
-- IMPORTANTE: aplicar ESTE archivo, no 'prisma db push'.
-- Es 100% aditivo: crea 2 enums y 2 tablas nuevas y no toca ninguna tabla existente.
-- Ver la nota sobre la deriva de schema en el mensaje del commit.

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

