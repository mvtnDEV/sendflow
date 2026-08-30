-- Campo `operator` y `conRetiro` en pedidos, para poder calcular margen.
--
-- COMO APLICARLO: pegar en el SQL Editor de Supabase.
-- Aditivo: crea un enum y agrega dos columnas. No modifica ni borra nada.
-- El ADD COLUMN con DEFAULT no reescribe la tabla (Postgres 11+).

-- CreateEnum
CREATE TYPE "Operator" AS ENUM ('NOW', 'FRET', 'MOOVEX');
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "conRetiro" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "operator" "Operator";
-- CreateIndex
CREATE INDEX "orders_operator_createdAt_idx" ON "orders"("operator", "createdAt");

-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL del operador en los pedidos que ya existen.
-- Fret usa codigos "FR-xxxx"; Now guarda un id numerico; el resto es reparto propio.
-- El codigo igual sabe deducirlo al vuelo (operadorDe), asi que si esto no se
-- corre nada se rompe: solo queda mas lento agrupar por operador.

UPDATE orders SET operator = 'FRET' WHERE operator IS NULL AND "externalId" LIKE 'FR-%';
UPDATE orders SET operator = 'NOW'  WHERE operator IS NULL AND "externalId" IS NOT NULL;
UPDATE orders SET operator = 'MOOVEX' WHERE operator IS NULL;

-- Como quedo repartido:
SELECT operator, COUNT(*) FROM orders GROUP BY operator ORDER BY 2 DESC;
