-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CustomerSourceType" AS ENUM ('MANUAL', 'CSV', 'WINTHOR');

-- CreateEnum
CREATE TYPE "CustomerImportSourceType" AS ENUM ('CSV', 'WINTHOR');

-- CreateEnum
CREATE TYPE "CustomerImportBatchStatus" AS ENUM ('PREVIEWED', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "CustomerImportItemStatus" AS ENUM ('CREATE', 'UPDATE', 'IGNORE', 'ERROR');

-- AlterEnum
ALTER TYPE "AuditEntityType" ADD VALUE 'CUSTOMER_IMPORT_BATCH';
ALTER TYPE "AuditEntityType" ADD VALUE 'CUSTOMER_IMPORT_ITEM';

-- AlterTable
ALTER TABLE "Customer"
ADD COLUMN "addressNumber" TEXT,
ADD COLUMN "cnpj" TEXT,
ADD COLUMN "complement" TEXT,
ADD COLUMN "contactName" TEXT,
ADD COLUMN "defaultPromoterUserId" TEXT,
ADD COLUMN "district" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "importBatchId" TEXT,
ADD COLUMN "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN "phone" TEXT,
ADD COLUMN "preferredVisitDays" TEXT[],
ADD COLUMN "preferredVisitTimeEnd" TEXT,
ADD COLUMN "preferredVisitTimeStart" TEXT,
ADD COLUMN "region" TEXT,
ADD COLUMN "routeName" TEXT,
ADD COLUMN "sourceType" "CustomerSourceType" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "stateRegistration" TEXT,
ADD COLUMN "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "supervisorUserId" TEXT,
ADD COLUMN "visitFrequency" TEXT,
ADD COLUMN "winthorCustomerCode" TEXT;

-- CreateTable
CREATE TABLE "CustomerImportBatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "sourceType" "CustomerImportSourceType" NOT NULL,
    "status" "CustomerImportBatchStatus" NOT NULL,
    "applyChanges" BOOLEAN NOT NULL DEFAULT false,
    "readCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "ignoredCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "logSummary" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerImportItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "customerId" TEXT,
    "rowNumber" INTEGER NOT NULL,
    "status" "CustomerImportItemStatus" NOT NULL,
    "customerCode" TEXT,
    "winthorCustomerCode" TEXT,
    "cnpj" TEXT,
    "legalName" TEXT,
    "tradeName" TEXT,
    "message" TEXT,
    "conflictKeys" TEXT[],
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerImportBatch_companyId_sourceType_createdAt_idx" ON "CustomerImportBatch"("companyId", "sourceType", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerImportBatch_actorUserId_createdAt_idx" ON "CustomerImportBatch"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerImportBatch_status_createdAt_idx" ON "CustomerImportBatch"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerImportItem_batchId_rowNumber_idx" ON "CustomerImportItem"("batchId", "rowNumber");

-- CreateIndex
CREATE INDEX "CustomerImportItem_status_createdAt_idx" ON "CustomerImportItem"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerImportItem_customerId_createdAt_idx" ON "CustomerImportItem"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_companyId_routeName_region_idx" ON "Customer"("companyId", "routeName", "region");

-- CreateIndex
CREATE INDEX "Customer_companyId_supervisorUserId_active_idx" ON "Customer"("companyId", "supervisorUserId", "active");

-- CreateIndex
CREATE INDEX "Customer_companyId_status_sourceType_idx" ON "Customer"("companyId", "status", "sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_winthorCustomerCode_key" ON "Customer"("companyId", "winthorCustomerCode");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_cnpj_key" ON "Customer"("companyId", "cnpj");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_supervisorUserId_fkey" FOREIGN KEY ("supervisorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_defaultPromoterUserId_fkey" FOREIGN KEY ("defaultPromoterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "CustomerImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerImportBatch" ADD CONSTRAINT "CustomerImportBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerImportBatch" ADD CONSTRAINT "CustomerImportBatch_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerImportItem" ADD CONSTRAINT "CustomerImportItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CustomerImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerImportItem" ADD CONSTRAINT "CustomerImportItem_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
