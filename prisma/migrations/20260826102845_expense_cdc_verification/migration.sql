-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "cdc" TEXT,
ADD COLUMN     "cdcEstado" TEXT,
ADD COLUMN     "cdcMensaje" TEXT,
ADD COLUMN     "cdcVerdict" TEXT,
ADD COLUMN     "cdcVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "cdcVerifiedBy" TEXT;
