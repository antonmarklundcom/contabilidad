-- CreateTable
CREATE TABLE "InvoiceLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tipoDocumento" INTEGER NOT NULL DEFAULT 1,
    "establecimiento" TEXT NOT NULL,
    "punto" TEXT NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PYG',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "invoiceId" TEXT,
    "createdBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLink_tokenHash_key" ON "InvoiceLink"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLink_invoiceId_key" ON "InvoiceLink"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceLink_companyId_expiresAt_idx" ON "InvoiceLink"("companyId", "expiresAt");

-- AddForeignKey
ALTER TABLE "InvoiceLink" ADD CONSTRAINT "InvoiceLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLink" ADD CONSTRAINT "InvoiceLink_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
