-- Campo `operator` en pedidos, para poder calcular el margen por operador.
--
-- COMO APLICARLO: pegar en el SQL Editor de Supabase.
-- Aditivo: crea un enum y agrega una columna nullable. No modifica ni borra nada.

-- CreateEnum
CREATE TYPE "Operator" AS ENUM ('NOW', 'FRET', 'MOOVEX');
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "operator" "Operator";
-- CreateIndex
CREATE INDEX "orders_operator_createdAt_idx" ON "orders"("operator", "createdAt");

-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL del operador en los pedidos que ya existen.
-- Fret usa codigos "FR-xxxx"; Now guarda un id numerico; el resto es reparto propio.
-- Si esto no se corre igual no se rompe nada: el codigo sabe deducirlo al vuelo
-- (operadorDe), solo queda mas lento agrupar por operador.

UPDATE orders SET operator = 'FRET' WHERE operator IS NULL AND "externalId" LIKE 'FR-%';
UPDATE orders SET operator = 'NOW'  WHERE operator IS NULL AND "externalId" IS NOT NULL;
UPDATE orders SET operator = 'MOOVEX' WHERE operator IS NULL;

-- Como quedo repartido:
SELECT operator, COUNT(*) FROM orders GROUP BY operator ORDER BY 2 DESC;
