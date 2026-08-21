-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "timbradoFechaFin" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "recipient" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationLog_companyId_sentAt_idx" ON "NotificationLog"("companyId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_companyId_kind_subject_threshold_key" ON "NotificationLog"("companyId", "kind", "subject", "threshold");

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
