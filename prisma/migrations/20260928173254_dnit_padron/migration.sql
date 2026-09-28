-- CreateTable
CREATE TABLE "DnitPadron" (
    "ruc" TEXT NOT NULL,
    "dv" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "rucAnterior" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DnitPadron_pkey" PRIMARY KEY ("ruc")
);

-- CreateTable
CREATE TABLE "PadronSync" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "rows" INTEGER NOT NULL DEFAULT 0,
    "rejectedRows" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "PadronSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PadronSync_startedAt_idx" ON "PadronSync"("startedAt");
