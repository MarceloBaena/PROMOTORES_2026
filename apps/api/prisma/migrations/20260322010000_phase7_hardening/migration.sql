-- AlterEnum
ALTER TYPE "GpsLogSource" ADD VALUE 'CUSTOMER_ARRIVAL';

-- AlterTable
ALTER TABLE "GpsLog" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "Journey" ADD COLUMN     "endEventId" TEXT,
ADD COLUMN     "startEventId" TEXT;

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "checkInEventId" TEXT,
ADD COLUMN     "checkOutEventId" TEXT;

-- AlterTable
ALTER TABLE "VisitChecklist" ADD COLUMN     "submissionEventId" TEXT;

-- AlterTable
ALTER TABLE "VisitPhoto" ADD COLUMN     "uploadEventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "GpsLog_eventId_key" ON "GpsLog"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Journey_startEventId_key" ON "Journey"("startEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Journey_endEventId_key" ON "Journey"("endEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_checkInEventId_key" ON "Visit"("checkInEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_checkOutEventId_key" ON "Visit"("checkOutEventId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitChecklist_submissionEventId_key" ON "VisitChecklist"("submissionEventId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitPhoto_uploadEventId_key" ON "VisitPhoto"("uploadEventId");

