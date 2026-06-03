-- CreateEnum
CREATE TYPE "RoutePlanningViewMode" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "RouteRecurrencePattern" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RouteItemPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "RouteChangeType" AS ENUM ('PLAN_CREATED', 'PLAN_UPDATED', 'PLAN_PUBLISHED', 'TEMPLATE_APPLIED', 'ITEM_ADDED', 'ITEM_UPDATED', 'ITEM_CANCELLED', 'ITEM_REORDERED', 'ITEM_RESCHEDULED', 'ITEM_PRIORITY_CHANGED', 'ITEM_NOTE_CHANGED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ROUTE_PUBLISHED', 'ROUTE_UPDATED', 'ROUTE_ITEM_ADDED', 'ROUTE_ITEM_CANCELLED', 'ROUTE_RESEQUENCED', 'SUPERVISOR_INSTRUCTION');

-- DropIndex
DROP INDEX IF EXISTS "CustomerImportItem_batchId_rowNumber_idx";

-- DropIndex
DROP INDEX IF EXISTS "RoutePlanItem_routePlanId_clientId_key";

-- DropIndex
DROP INDEX IF EXISTS "RoutePlanItem_routePlanId_sequence_key";

-- AlterTable
ALTER TABLE "RoutePlan"
ADD COLUMN "lastPublishedByUserId" TEXT,
ADD COLUMN "planningView" "RoutePlanningViewMode" NOT NULL DEFAULT 'DAILY',
ADD COLUMN "publishedAt" TIMESTAMP(3),
ADD COLUMN "templateId" TEXT,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "RoutePlanItem"
ADD COLUMN "cancellationReason" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledByUserId" TEXT,
ADD COLUMN "priority" "RouteItemPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN "templateItemId" TEXT;

-- CreateTable
CREATE TABLE "RouteTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "promoterId" TEXT NOT NULL,
    "supervisorUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "recurrence" "RouteRecurrencePattern" NOT NULL,
    "weekdays" "ScheduleDayOfWeek"[],
    "monthDays" INTEGER[],
    "effectiveFrom" TIMESTAMP(3),
    "effectiveUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RouteTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteTemplateItem" (
    "id" TEXT NOT NULL,
    "routeTemplateId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "priority" "RouteItemPriority" NOT NULL DEFAULT 'NORMAL',
    "plannedStartTime" TEXT,
    "plannedEndTime" TEXT,
    "dayOfWeek" "ScheduleDayOfWeek",
    "dayOfMonth" INTEGER,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RouteTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteChangeLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "routePlanId" TEXT NOT NULL,
    "routePlanItemId" TEXT,
    "actorUserId" TEXT,
    "changeType" "RouteChangeType" NOT NULL,
    "summary" TEXT NOT NULL,
    "previousSnapshot" JSONB,
    "nextSnapshot" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RouteChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "routePlanId" TEXT,
    "routePlanItemId" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RouteTemplate_companyId_promoterId_active_idx" ON "RouteTemplate"("companyId", "promoterId", "active");
CREATE INDEX "RouteTemplate_supervisorUserId_active_idx" ON "RouteTemplate"("supervisorUserId", "active");
CREATE INDEX "RouteTemplate_recurrence_active_idx" ON "RouteTemplate"("recurrence", "active");
CREATE INDEX "RouteTemplateItem_routeTemplateId_active_sequence_idx" ON "RouteTemplateItem"("routeTemplateId", "active", "sequence");
CREATE INDEX "RouteTemplateItem_customerId_active_idx" ON "RouteTemplateItem"("customerId", "active");
CREATE INDEX "RouteTemplateItem_dayOfWeek_active_idx" ON "RouteTemplateItem"("dayOfWeek", "active");
CREATE INDEX "RouteTemplateItem_dayOfMonth_active_idx" ON "RouteTemplateItem"("dayOfMonth", "active");
CREATE INDEX "RouteChangeLog_routePlanId_createdAt_idx" ON "RouteChangeLog"("routePlanId", "createdAt");
CREATE INDEX "RouteChangeLog_routePlanItemId_createdAt_idx" ON "RouteChangeLog"("routePlanItemId", "createdAt");
CREATE INDEX "RouteChangeLog_actorUserId_createdAt_idx" ON "RouteChangeLog"("actorUserId", "createdAt");
CREATE INDEX "RouteChangeLog_changeType_createdAt_idx" ON "RouteChangeLog"("changeType", "createdAt");
CREATE INDEX "Notification_recipientUserId_readAt_createdAt_idx" ON "Notification"("recipientUserId", "readAt", "createdAt");
CREATE INDEX "Notification_routePlanId_createdAt_idx" ON "Notification"("routePlanId", "createdAt");
CREATE INDEX "Notification_routePlanItemId_createdAt_idx" ON "Notification"("routePlanItemId", "createdAt");
CREATE INDEX "Notification_type_createdAt_idx" ON "Notification"("type", "createdAt");
CREATE INDEX "RoutePlan_companyId_promoterId_routeDate_idx" ON "RoutePlan"("companyId", "promoterId", "routeDate");
CREATE INDEX "RoutePlan_templateId_routeDate_idx" ON "RoutePlan"("templateId", "routeDate");
CREATE INDEX "RoutePlan_publishedAt_routeDate_idx" ON "RoutePlan"("publishedAt", "routeDate");
CREATE INDEX "RoutePlanItem_routePlanId_active_sequence_idx" ON "RoutePlanItem"("routePlanId", "active", "sequence");
CREATE INDEX "RoutePlanItem_routePlanId_cancelledAt_idx" ON "RoutePlanItem"("routePlanId", "cancelledAt");
CREATE INDEX "RoutePlanItem_priority_plannedStartAt_idx" ON "RoutePlanItem"("priority", "plannedStartAt");

-- AddForeignKey
ALTER TABLE "RoutePlan"
ADD CONSTRAINT "RoutePlan_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "RouteTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RoutePlan"
ADD CONSTRAINT "RoutePlan_lastPublishedByUserId_fkey"
FOREIGN KEY ("lastPublishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RoutePlanItem"
ADD CONSTRAINT "RoutePlanItem_cancelledByUserId_fkey"
FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RoutePlanItem"
ADD CONSTRAINT "RoutePlanItem_templateItemId_fkey"
FOREIGN KEY ("templateItemId") REFERENCES "RouteTemplateItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RouteTemplate"
ADD CONSTRAINT "RouteTemplate_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RouteTemplate"
ADD CONSTRAINT "RouteTemplate_promoterId_fkey"
FOREIGN KEY ("promoterId") REFERENCES "Promoter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RouteTemplate"
ADD CONSTRAINT "RouteTemplate_supervisorUserId_fkey"
FOREIGN KEY ("supervisorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RouteTemplateItem"
ADD CONSTRAINT "RouteTemplateItem_routeTemplateId_fkey"
FOREIGN KEY ("routeTemplateId") REFERENCES "RouteTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RouteTemplateItem"
ADD CONSTRAINT "RouteTemplateItem_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RouteChangeLog"
ADD CONSTRAINT "RouteChangeLog_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RouteChangeLog"
ADD CONSTRAINT "RouteChangeLog_routePlanId_fkey"
FOREIGN KEY ("routePlanId") REFERENCES "RoutePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RouteChangeLog"
ADD CONSTRAINT "RouteChangeLog_routePlanItemId_fkey"
FOREIGN KEY ("routePlanItemId") REFERENCES "RoutePlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RouteChangeLog"
ADD CONSTRAINT "RouteChangeLog_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_recipientUserId_fkey"
FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_routePlanId_fkey"
FOREIGN KEY ("routePlanId") REFERENCES "RoutePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_routePlanItemId_fkey"
FOREIGN KEY ("routePlanItemId") REFERENCES "RoutePlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
