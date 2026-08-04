-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ClientDocType" AS ENUM ('RUC', 'CI', 'PASAPORTE', 'INNOMINADO');

-- CreateEnum
CREATE TYPE "IvaRate" AS ENUM ('IVA_10', 'IVA_5', 'EXENTA');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('PRODUCTO', 'SERVICIO');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENT', 'APPROVED', 'REJECTED', 'CANCELLED', 'CONTINGENCY');

-- CreateEnum
CREATE TYPE "ExpenseSource" AS ENUM ('PHOTO', 'PDF', 'MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('NEEDS_REVIEW', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "locale" TEXT NOT NULL DEFAULT 'es',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "ruc" TEXT NOT NULL,
    "dv" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "nombreFantasia" TEXT,
    "actividades" JSONB NOT NULL,
    "timbradoNumero" TEXT NOT NULL,
    "timbradoFechaInicio" TIMESTAMP(3) NOT NULL,
    "tipoContribuyente" INTEGER NOT NULL DEFAULT 2,
    "tipoRegimen" INTEGER,
    "direccion" TEXT NOT NULL,
    "numeroCasa" TEXT NOT NULL DEFAULT '0',
    "complementoDireccion1" TEXT,
    "complementoDireccion2" TEXT,
    "departamento" INTEGER NOT NULL,
    "departamentoDescripcion" TEXT NOT NULL,
    "distrito" INTEGER NOT NULL,
    "distritoDescripcion" TEXT NOT NULL,
    "ciudad" INTEGER NOT NULL,
    "ciudadDescripcion" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "logoPath" TEXT,
    "certPath" TEXT,
    "certPasswordEnc" TEXT,
    "certExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Establishment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "denominacion" TEXT,
    "direccion" TEXT,
    "numeroCasa" TEXT,
    "complementoDireccion1" TEXT,
    "complementoDireccion2" TEXT,
    "departamento" INTEGER,
    "departamentoDescripcion" TEXT,
    "distrito" INTEGER,
    "distritoDescripcion" TEXT,
    "ciudad" INTEGER,
    "ciudadDescripcion" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Establishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpeditionPoint" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpeditionPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "expeditionPointId" TEXT NOT NULL,
    "tipoDocumento" INTEGER NOT NULL,
    "currentNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "docType" "ClientDocType" NOT NULL DEFAULT 'RUC',
    "ruc" TEXT,
    "dv" TEXT,
    "documentoNumero" TEXT,
    "razonSocial" TEXT NOT NULL,
    "nombreFantasia" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "pais" TEXT NOT NULL DEFAULT 'PRY',
    "paisDescripcion" TEXT NOT NULL DEFAULT 'Paraguay',
    "isTaxpayer" BOOLEAN NOT NULL DEFAULT true,
    "tipoContribuyente" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcionEs" TEXT NOT NULL,
    "descripcionEn" TEXT,
    "unidadMedida" INTEGER NOT NULL DEFAULT 77,
    "precioUnitario" DECIMAL(18,4) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PYG',
    "ivaRate" "IvaRate" NOT NULL DEFAULT 'IVA_10',
    "tipo" "ProductType" NOT NULL DEFAULT 'PRODUCTO',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tipoDocumento" INTEGER NOT NULL DEFAULT 1,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "cdc" TEXT,
    "establecimiento" TEXT NOT NULL,
    "punto" TEXT NOT NULL,
    "numero" TEXT,
    "fullNumber" TEXT,
    "securityCode" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PYG',
    "exchangeRate" DECIMAL(18,4),
    "condicionVenta" INTEGER NOT NULL DEFAULT 1,
    "creditPlazo" TEXT,
    "creditCuotas" INTEGER,
    "tipoTransaccion" INTEGER NOT NULL DEFAULT 1,
    "descripcion" TEXT,
    "observacion" TEXT,
    "totalGravada10" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalGravada5" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalExenta" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalIva10" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalIva5" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalIva" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalDescuento" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sifenEstado" TEXT,
    "sifenCodigoRespuesta" TEXT,
    "sifenMensaje" TEXT,
    "sifenProtocolo" TEXT,
    "xmlPath" TEXT,
    "signedXmlPath" TEXT,
    "kudePath" TEXT,
    "qrText" TEXT,
    "originalInvoiceId" TEXT,
    "motivoNota" INTEGER,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "emittedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "contingencyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "codigo" TEXT,
    "descripcion" TEXT NOT NULL,
    "unidadMedida" INTEGER NOT NULL DEFAULT 77,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "precioUnitario" DECIMAL(18,4) NOT NULL,
    "descuento" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "ivaTipo" INTEGER NOT NULL DEFAULT 1,
    "ivaProporcion" INTEGER NOT NULL DEFAULT 100,
    "iva" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEs" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "source" "ExpenseSource" NOT NULL DEFAULT 'MANUAL',
    "status" "ExpenseStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "supplierRuc" TEXT,
    "supplierDv" TEXT,
    "supplierRazonSocial" TEXT,
    "timbrado" TEXT,
    "tipoComprobante" TEXT,
    "numeroComprobante" TEXT,
    "fecha" TIMESTAMP(3),
    "gravada10" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "gravada5" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "exenta" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "iva10" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "iva5" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "moneda" TEXT NOT NULL DEFAULT 'PYG',
    "exchangeRate" DECIMAL(18,4),
    "deduciblePercent" INTEGER NOT NULL DEFAULT 100,
    "categoryId" TEXT,
    "filePath" TEXT,
    "fileMime" TEXT,
    "ocrRawJson" JSONB,
    "confidence" JSONB,
    "duplicateOfId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseItem" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(18,4),
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tasa" INTEGER NOT NULL DEFAULT 10,
    "deduciblePercent" INTEGER NOT NULL DEFAULT 100,
    "deducibleReason" TEXT,
    "aiSuggested" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ExpenseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierCategoryMap" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierRuc" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "SupplierCategoryMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobQueue" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SifenLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "invoiceId" TEXT,
    "operation" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "requestXml" TEXT,
    "responseXml" TEXT,
    "success" BOOLEAN,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SifenLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Establishment_companyId_codigo_key" ON "Establishment"("companyId", "codigo");

-- CreateIndex
CREATE INDEX "ExpeditionPoint_companyId_idx" ON "ExpeditionPoint"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpeditionPoint_establishmentId_codigo_key" ON "ExpeditionPoint"("establishmentId", "codigo");

-- CreateIndex
CREATE INDEX "DocumentSequence_companyId_idx" ON "DocumentSequence"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSequence_expeditionPointId_tipoDocumento_key" ON "DocumentSequence"("expeditionPointId", "tipoDocumento");

-- CreateIndex
CREATE INDEX "Client_companyId_razonSocial_idx" ON "Client"("companyId", "razonSocial");

-- CreateIndex
CREATE INDEX "Client_companyId_ruc_idx" ON "Client"("companyId", "ruc");

-- CreateIndex
CREATE INDEX "Product_companyId_descripcionEs_idx" ON "Product"("companyId", "descripcionEs");

-- CreateIndex
CREATE UNIQUE INDEX "Product_companyId_codigo_key" ON "Product"("companyId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_cdc_key" ON "Invoice"("cdc");

-- CreateIndex
CREATE INDEX "Invoice_companyId_status_idx" ON "Invoice"("companyId", "status");

-- CreateIndex
CREATE INDEX "Invoice_companyId_issueDate_idx" ON "Invoice"("companyId", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_tipoDocumento_establecimiento_punto_numer_key" ON "Invoice"("companyId", "tipoDocumento", "establecimiento", "punto", "numero");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_companyId_code_key" ON "ExpenseCategory"("companyId", "code");

-- CreateIndex
CREATE INDEX "Expense_companyId_fecha_idx" ON "Expense"("companyId", "fecha");

-- CreateIndex
CREATE INDEX "Expense_companyId_status_idx" ON "Expense"("companyId", "status");

-- CreateIndex
CREATE INDEX "Expense_companyId_supplierRuc_numeroComprobante_idx" ON "Expense"("companyId", "supplierRuc", "numeroComprobante");

-- CreateIndex
CREATE INDEX "ExpenseItem_expenseId_idx" ON "ExpenseItem"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCategoryMap_companyId_supplierRuc_key" ON "SupplierCategoryMap"("companyId", "supplierRuc");

-- CreateIndex
CREATE INDEX "JobQueue_status_nextRunAt_idx" ON "JobQueue"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "SifenLog_invoiceId_idx" ON "SifenLog"("invoiceId");

-- CreateIndex
CREATE INDEX "SifenLog_createdAt_idx" ON "SifenLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_companyId_key_key" ON "Setting"("companyId", "key");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Establishment" ADD CONSTRAINT "Establishment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpeditionPoint" ADD CONSTRAINT "ExpeditionPoint_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSequence" ADD CONSTRAINT "DocumentSequence_expeditionPointId_fkey" FOREIGN KEY ("expeditionPointId") REFERENCES "ExpeditionPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_originalInvoiceId_fkey" FOREIGN KEY ("originalInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseItem" ADD CONSTRAINT "ExpenseItem_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCategoryMap" ADD CONSTRAINT "SupplierCategoryMap_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCategoryMap" ADD CONSTRAINT "SupplierCategoryMap_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SifenLog" ADD CONSTRAINT "SifenLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

