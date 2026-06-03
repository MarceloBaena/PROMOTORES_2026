-- CreateEnum
CREATE TYPE "PhotoCategory" AS ENUM ('GENERAL', 'SHELF', 'DISPLAY', 'PRICE_TAG', 'STOCK', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AlertType" ADD VALUE 'MISSING_BEFORE_PHOTO';
ALTER TYPE "AlertType" ADD VALUE 'MISSING_AFTER_PHOTO';
ALTER TYPE "AlertType" ADD VALUE 'MISSING_CHECKLIST';
ALTER TYPE "AlertType" ADD VALUE 'SKIPPED_CUSTOMER';
ALTER TYPE "AlertType" ADD VALUE 'RELEVANT_DELAY';

-- AlterTable
ALTER TABLE "VisitPhoto" ADD COLUMN     "category" "PhotoCategory" NOT NULL DEFAULT 'GENERAL';

-- CreateIndex
CREATE INDEX "VisitPhoto_visitId_category_idx" ON "VisitPhoto"("visitId", "category");
