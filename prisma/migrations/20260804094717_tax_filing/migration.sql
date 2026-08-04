-- CreateEnum
CREATE TYPE "TaxFilingType" AS ENUM ('IVA', 'IRP');

-- CreateEnum
CREATE TYPE "TaxFilingStatus" AS ENUM ('DRAFT', 'CLOSED', 'SUBMITTED', 'PAID');

-- CreateTable
CREATE TABLE "TaxFiling" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "TaxFilingType" NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "status" "TaxFilingStatus" NOT NULL DEFAULT 'DRAFT',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "officialPdfPath" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxFiling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxFiling_companyId_dueDate_idx" ON "TaxFiling"("companyId", "dueDate");

-- CreateIndex
CREATE INDEX "TaxFiling_companyId_status_idx" ON "TaxFiling"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TaxFiling_companyId_type_year_month_key" ON "TaxFiling"("companyId", "type", "year", "month");

-- AddForeignKey
ALTER TABLE "TaxFiling" ADD CONSTRAINT "TaxFiling_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Data migration: copy closed periods out of the Setting blob into TaxFiling.
--
-- Before this migration a period close lived in Setting as
--   key   = 'f120.closed.YYYY-MM'
--   value = {"closedBy":…, "closedAt":…, "snapshot":{…}}
--
-- This COPIES those rows. The originals are deliberately left in place: tax
-- documents are never deleted (CLAUDE.md), and keeping them means this
-- migration can be re-run and an older build can still read its own data.
-- ON CONFLICT DO NOTHING makes the copy idempotent.
--
-- dueDate is derived from the SET perpetual calendar: day = 7 + 2 × (last
-- digit of the RUC, excluding the check digit), in the month AFTER the period
-- (IVA is filed in arrears). The weekend/holiday roll-forward that
-- src/lib/tax/calendar.ts applies is NOT reproduced here — it needs an Easter
-- computation that does not belong in SQL. The consequence is safe by
-- construction: this baseline is never LATER than the true due date, only
-- possibly a day or two earlier, and the application recomputes the exact
-- date via calendar.ts whenever it writes a filing.
-- ---------------------------------------------------------------------------
INSERT INTO "TaxFiling" (
    "id", "companyId", "type", "year", "month", "status",
    "dueDate", "snapshot", "closedBy", "closedAt", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    p."companyId",
    'IVA'::"TaxFilingType",
    p."year",
    p."month",
    'CLOSED'::"TaxFilingStatus",
    make_date(
        CASE WHEN p."month" = 12 THEN p."year" + 1 ELSE p."year" END,
        CASE WHEN p."month" = 12 THEN 1 ELSE p."month" + 1 END,
        p."dueDay"
    )::timestamp,
    p."snapshot",
    p."closedBy",
    p."closedAt",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT
        s."companyId",
        substring(s."key" from 13 for 4)::int AS "year",
        substring(s."key" from 18 for 2)::int AS "month",
        s."value"::jsonb -> 'snapshot'          AS "snapshot",
        s."value"::jsonb ->> 'closedBy'         AS "closedBy",
        (s."value"::jsonb ->> 'closedAt')::timestamp AS "closedAt",
        -- Legacy RUCs may end in a letter; fall back to the earliest day in
        -- the calendar (the 7th) rather than risk a date that is too late.
        CASE
            WHEN right(c."ruc", 1) ~ '^[0-9]$' THEN 7 + 2 * right(c."ruc", 1)::int
            ELSE 7
        END AS "dueDay"
    FROM "Setting" s
    JOIN "Company" c ON c."id" = s."companyId"
    WHERE s."key" ~ '^f120\.closed\.[0-9]{4}-[0-9]{2}$'
      AND pg_input_is_valid(s."value", 'jsonb')
      AND s."value"::jsonb ? 'snapshot'
) AS p
WHERE p."month" BETWEEN 1 AND 12
ON CONFLICT ("companyId", "type", "year", "month") DO NOTHING;
