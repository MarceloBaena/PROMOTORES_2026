-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PROMOTER', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "RoutePlanStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RouteStopStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'CHECKED_OUT', 'SYNC_PENDING', 'COMPLETED', 'PARTIAL', 'NOT_DONE');

-- CreateEnum
CREATE TYPE "VisitCompletionStatus" AS ENUM ('COMPLETED', 'PARTIAL', 'NOT_DONE');

-- CreateEnum
CREATE TYPE "PhotoType" AS ENUM ('BEFORE', 'AFTER');

-- CreateEnum
CREATE TYPE "ChecklistItemType" AS ENUM ('BOOLEAN', 'TEXT');

-- CreateEnum
CREATE TYPE "ScheduleDayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "GpsLogSource" AS ENUM ('JOURNEY_START', 'CHECK_IN', 'TRACKING', 'CHECK_OUT', 'JOURNEY_END', 'SYNC');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('OUTSIDE_GEOFENCE', 'PENDING_SYNC', 'PARTIAL_VISIT', 'MISSED_VISIT', 'NO_ACTIVE_JOURNEY');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM ('AUTH', 'COMPANY', 'USER', 'PROMOTER', 'CUSTOMER', 'CUSTOMER_SCHEDULE', 'ROUTE_PLAN', 'ROUTE_PLAN_ITEM', 'JOURNEY', 'GPS_LOG', 'VISIT', 'VISIT_CHECKLIST', 'VISIT_CHECKLIST_ANSWER', 'CHECKLIST_TEMPLATE', 'CHECKLIST_QUESTION', 'PHOTO', 'ALERT', 'REFRESH_TOKEN');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "documentNumber" TEXT,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Cuiaba',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promoter" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "supervisorId" TEXT,
    "hireDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promoter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "documentNumber" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zipCode" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geofenceRadiusM" INTEGER NOT NULL DEFAULT 150,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSchedule" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dayOfWeek" "ScheduleDayOfWeek" NOT NULL,
    "visitWindowStart" TEXT,
    "visitWindowEnd" TEXT,
    "sequenceHint" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutePlan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "routeDate" TIMESTAMP(3) NOT NULL,
    "promoterId" TEXT NOT NULL,
    "supervisorUserId" TEXT,
    "status" "RoutePlanStatus" NOT NULL DEFAULT 'PUBLISHED',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutePlanItem" (
    "id" TEXT NOT NULL,
    "routePlanId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "RouteStopStatus" NOT NULL DEFAULT 'PLANNED',
    "plannedStartAt" TIMESTAMP(3),
    "plannedEndAt" TIMESTAMP(3),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutePlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journey" (
    "id" TEXT NOT NULL,
    "routePlanId" TEXT,
    "promoterId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "startLatitude" DOUBLE PRECISION NOT NULL,
    "startLongitude" DOUBLE PRECISION NOT NULL,
    "endLatitude" DOUBLE PRECISION,
    "endLongitude" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Journey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "routePlanId" TEXT NOT NULL,
    "routeStopId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "promoterId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL,
    "checkOutAt" TIMESTAMP(3),
    "checkInLatitude" DOUBLE PRECISION NOT NULL,
    "checkInLongitude" DOUBLE PRECISION NOT NULL,
    "checkOutLatitude" DOUBLE PRECISION,
    "checkOutLongitude" DOUBLE PRECISION,
    "outsideGeofence" BOOLEAN NOT NULL DEFAULT false,
    "geofenceDistanceM" DOUBLE PRECISION,
    "outsideGeofenceJustification" TEXT,
    "notes" TEXT,
    "completionStatus" "VisitCompletionStatus",
    "status" "RouteStopStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistQuestion" (
    "id" TEXT NOT NULL,
    "checklistTemplateId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "helpText" TEXT,
    "type" "ChecklistItemType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitChecklist" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "checklistTemplateId" TEXT NOT NULL,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitChecklistAnswer" (
    "id" TEXT NOT NULL,
    "visitChecklistId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "valueBoolean" BOOLEAN,
    "valueText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitChecklistAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GpsLog" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "promoterId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracyM" DOUBLE PRECISION,
    "source" "GpsLogSource" NOT NULL DEFAULT 'TRACKING',
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GpsLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitPhoto" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "promoterId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "PhotoType" NOT NULL,
    "storageBucket" TEXT,
    "storageKey" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeInBytes" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "promoterId" TEXT NOT NULL,
    "clientId" TEXT,
    "visitId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitStatusHistory" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "previousStatus" "RouteStopStatus",
    "nextStatus" "RouteStopStatus" NOT NULL,
    "previousCompletionStatus" "VisitCompletionStatus",
    "nextCompletionStatus" "VisitCompletionStatus",
    "note" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "entityType" "AuditEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_code_key" ON "Company"("code");

-- CreateIndex
CREATE INDEX "Company_active_deletedAt_idx" ON "Company"("active", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_role_active_idx" ON "User"("companyId", "role", "active");

-- CreateIndex
CREATE INDEX "User_companyId_deletedAt_idx" ON "User"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "Promoter_companyId_active_idx" ON "Promoter"("companyId", "active");

-- CreateIndex
CREATE INDEX "Promoter_supervisorId_active_idx" ON "Promoter"("supervisorId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Promoter_companyId_employeeCode_key" ON "Promoter"("companyId", "employeeCode");

-- CreateIndex
CREATE INDEX "Customer_companyId_tradeName_active_idx" ON "Customer"("companyId", "tradeName", "active");

-- CreateIndex
CREATE INDEX "Customer_companyId_city_state_idx" ON "Customer"("companyId", "city", "state");

-- CreateIndex
CREATE INDEX "Customer_active_deletedAt_idx" ON "Customer"("active", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_code_key" ON "Customer"("companyId", "code");

-- CreateIndex
CREATE INDEX "CustomerSchedule_dayOfWeek_active_idx" ON "CustomerSchedule"("dayOfWeek", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSchedule_customerId_dayOfWeek_key" ON "CustomerSchedule"("customerId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "RoutePlan_companyId_routeDate_idx" ON "RoutePlan"("companyId", "routeDate");

-- CreateIndex
CREATE INDEX "RoutePlan_promoterId_routeDate_idx" ON "RoutePlan"("promoterId", "routeDate");

-- CreateIndex
CREATE INDEX "RoutePlan_status_routeDate_idx" ON "RoutePlan"("status", "routeDate");

-- CreateIndex
CREATE INDEX "RoutePlan_active_routeDate_idx" ON "RoutePlan"("active", "routeDate");

-- CreateIndex
CREATE UNIQUE INDEX "RoutePlan_routeDate_promoterId_key" ON "RoutePlan"("routeDate", "promoterId");

-- CreateIndex
CREATE INDEX "RoutePlanItem_routePlanId_status_idx" ON "RoutePlanItem"("routePlanId", "status");

-- CreateIndex
CREATE INDEX "RoutePlanItem_clientId_status_idx" ON "RoutePlanItem"("clientId", "status");

-- CreateIndex
CREATE INDEX "RoutePlanItem_status_plannedStartAt_idx" ON "RoutePlanItem"("status", "plannedStartAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoutePlanItem_routePlanId_clientId_key" ON "RoutePlanItem"("routePlanId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutePlanItem_routePlanId_sequence_key" ON "RoutePlanItem"("routePlanId", "sequence");

-- CreateIndex
CREATE INDEX "Journey_promoterId_active_idx" ON "Journey"("promoterId", "active");

-- CreateIndex
CREATE INDEX "Journey_startedAt_idx" ON "Journey"("startedAt");

-- CreateIndex
CREATE INDEX "Journey_routePlanId_startedAt_idx" ON "Journey"("routePlanId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_routeStopId_key" ON "Visit"("routeStopId");

-- CreateIndex
CREATE INDEX "Visit_promoterId_status_idx" ON "Visit"("promoterId", "status");

-- CreateIndex
CREATE INDEX "Visit_journeyId_status_idx" ON "Visit"("journeyId", "status");

-- CreateIndex
CREATE INDEX "Visit_clientId_status_idx" ON "Visit"("clientId", "status");

-- CreateIndex
CREATE INDEX "Visit_routePlanId_checkInAt_idx" ON "Visit"("routePlanId", "checkInAt");

-- CreateIndex
CREATE INDEX "Visit_checkOutAt_completionStatus_idx" ON "Visit"("checkOutAt", "completionStatus");

-- CreateIndex
CREATE INDEX "ChecklistTemplate_companyId_active_idx" ON "ChecklistTemplate"("companyId", "active");

-- CreateIndex
CREATE INDEX "ChecklistTemplate_active_deletedAt_idx" ON "ChecklistTemplate"("active", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistTemplate_companyId_code_version_key" ON "ChecklistTemplate"("companyId", "code", "version");

-- CreateIndex
CREATE INDEX "ChecklistQuestion_checklistTemplateId_active_sortOrder_idx" ON "ChecklistQuestion"("checklistTemplateId", "active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistQuestion_checklistTemplateId_code_key" ON "ChecklistQuestion"("checklistTemplateId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "VisitChecklist_visitId_key" ON "VisitChecklist"("visitId");

-- CreateIndex
CREATE INDEX "VisitChecklist_checklistTemplateId_submittedAt_idx" ON "VisitChecklist"("checklistTemplateId", "submittedAt");

-- CreateIndex
CREATE INDEX "VisitChecklistAnswer_visitId_idx" ON "VisitChecklistAnswer"("visitId");

-- CreateIndex
CREATE INDEX "VisitChecklistAnswer_templateId_idx" ON "VisitChecklistAnswer"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitChecklistAnswer_visitChecklistId_templateId_key" ON "VisitChecklistAnswer"("visitChecklistId", "templateId");

-- CreateIndex
CREATE INDEX "GpsLog_journeyId_capturedAt_idx" ON "GpsLog"("journeyId", "capturedAt");

-- CreateIndex
CREATE INDEX "GpsLog_promoterId_capturedAt_idx" ON "GpsLog"("promoterId", "capturedAt");

-- CreateIndex
CREATE INDEX "GpsLog_capturedAt_idx" ON "GpsLog"("capturedAt");

-- CreateIndex
CREATE INDEX "VisitPhoto_visitId_type_idx" ON "VisitPhoto"("visitId", "type");

-- CreateIndex
CREATE INDEX "VisitPhoto_promoterId_capturedAt_idx" ON "VisitPhoto"("promoterId", "capturedAt");

-- CreateIndex
CREATE INDEX "VisitPhoto_clientId_capturedAt_idx" ON "VisitPhoto"("clientId", "capturedAt");

-- CreateIndex
CREATE INDEX "Alert_severity_resolvedAt_idx" ON "Alert"("severity", "resolvedAt");

-- CreateIndex
CREATE INDEX "Alert_promoterId_createdAt_idx" ON "Alert"("promoterId", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_clientId_createdAt_idx" ON "Alert"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_type_createdAt_idx" ON "Alert"("type", "createdAt");

-- CreateIndex
CREATE INDEX "VisitStatusHistory_visitId_changedAt_idx" ON "VisitStatusHistory"("visitId", "changedAt");

-- CreateIndex
CREATE INDEX "VisitStatusHistory_nextStatus_changedAt_idx" ON "VisitStatusHistory"("nextStatus", "changedAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_expiresAt_idx" ON "RefreshToken"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "RefreshToken_revokedAt_expiresAt_idx" ON "RefreshToken"("revokedAt", "expiresAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promoter" ADD CONSTRAINT "Promoter_id_fkey" FOREIGN KEY ("id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promoter" ADD CONSTRAINT "Promoter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promoter" ADD CONSTRAINT "Promoter_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSchedule" ADD CONSTRAINT "CustomerSchedule_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePlan" ADD CONSTRAINT "RoutePlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePlan" ADD CONSTRAINT "RoutePlan_promoterId_fkey" FOREIGN KEY ("promoterId") REFERENCES "Promoter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePlan" ADD CONSTRAINT "RoutePlan_supervisorUserId_fkey" FOREIGN KEY ("supervisorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePlanItem" ADD CONSTRAINT "RoutePlanItem_routePlanId_fkey" FOREIGN KEY ("routePlanId") REFERENCES "RoutePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePlanItem" ADD CONSTRAINT "RoutePlanItem_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_routePlanId_fkey" FOREIGN KEY ("routePlanId") REFERENCES "RoutePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_promoterId_fkey" FOREIGN KEY ("promoterId") REFERENCES "Promoter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_routePlanId_fkey" FOREIGN KEY ("routePlanId") REFERENCES "RoutePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_routeStopId_fkey" FOREIGN KEY ("routeStopId") REFERENCES "RoutePlanItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_promoterId_fkey" FOREIGN KEY ("promoterId") REFERENCES "Promoter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistQuestion" ADD CONSTRAINT "ChecklistQuestion_checklistTemplateId_fkey" FOREIGN KEY ("checklistTemplateId") REFERENCES "ChecklistTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitChecklist" ADD CONSTRAINT "VisitChecklist_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitChecklist" ADD CONSTRAINT "VisitChecklist_checklistTemplateId_fkey" FOREIGN KEY ("checklistTemplateId") REFERENCES "ChecklistTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitChecklistAnswer" ADD CONSTRAINT "VisitChecklistAnswer_visitChecklistId_fkey" FOREIGN KEY ("visitChecklistId") REFERENCES "VisitChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitChecklistAnswer" ADD CONSTRAINT "VisitChecklistAnswer_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitChecklistAnswer" ADD CONSTRAINT "VisitChecklistAnswer_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GpsLog" ADD CONSTRAINT "GpsLog_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GpsLog" ADD CONSTRAINT "GpsLog_promoterId_fkey" FOREIGN KEY ("promoterId") REFERENCES "Promoter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitPhoto" ADD CONSTRAINT "VisitPhoto_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitPhoto" ADD CONSTRAINT "VisitPhoto_promoterId_fkey" FOREIGN KEY ("promoterId") REFERENCES "Promoter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitPhoto" ADD CONSTRAINT "VisitPhoto_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_promoterId_fkey" FOREIGN KEY ("promoterId") REFERENCES "Promoter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitStatusHistory" ADD CONSTRAINT "VisitStatusHistory_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

