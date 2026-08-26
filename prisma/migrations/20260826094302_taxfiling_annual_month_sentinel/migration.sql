-- Makes the (companyId, type, year, month) unique constraint dedupe ANNUAL
-- filings too.
--
-- Postgres treats NULLs as distinct in a unique index, so while `month` was
-- nullable the constraint deduped monthly (IVA) filings and did nothing at all
-- for annual (IRP) ones: two IRP returns for the same company and fiscal year
-- would both insert. Annual filings now carry the sentinel 0 (ANNUAL_MONTH,
-- src/lib/tax/filing-period.ts), a value no real month can take, so the
-- existing constraint covers both kinds with no partial index — which Prisma
-- cannot express and CI's `migrate diff` would therefore report as drift.
--
-- Data migration first, shape change second. It is idempotent: re-running it
-- matches no rows once every filing carries a month. Nothing is deleted — if a
-- database somehow already holds two annual rows for the same year, the UPDATE
-- collides with the unique index and the migration FAILS rather than choosing
-- which declared filing to discard. Tax documents are never deleted; a human
-- picks. (No such row can exist in practice: nothing wrote type = 'IRP' before
-- this migration, and every IVA close passed a month.)

-- Existing annual filings adopt the sentinel.
UPDATE "TaxFiling" SET "month" = 0 WHERE "month" IS NULL;

-- AlterTable
ALTER TABLE "TaxFiling" ALTER COLUMN "month" SET NOT NULL;
