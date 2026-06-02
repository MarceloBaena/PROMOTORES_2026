-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('ADMIN', 'SUPERVISOR', 'PROMOTOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RouteItemStatus" AS ENUM ('PLANNED', 'COMPLETED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('pending', 'in_progress', 'completed', 'not_completed');

-- CreateEnum
CREATE TYPE "PhotoType" AS ENUM ('checkin', 'before', 'after', 'occurrence_extra');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('pending', 'syncing', 'synced', 'failed');

-- CreateEnum
CREATE TYPE "SyncType" AS ENUM ('INITIAL_DOWNLOAD', 'CLIENTS_DOWNLOAD', 'ROUTES_DOWNLOAD', 'VISIT_UPLOAD', 'PHOTO_UPLOAD', 'OCCURRENCE_UPLOAD', 'STATUS_CHECK', 'REPROCESS', 'CSV_IMPORT');

-- CreateEnum
CREATE TYPE "SyncEntityType" AS ENUM ('VISIT', 'PHOTO', 'OCCURRENCE');

-- CreateEnum
CREATE TYPE "AuditFlagType" AS ENUM ('GPS_MISSING', 'OUTSIDE_GEOFENCE', 'MISSING_REQUIRED_PHOTO', 'TOO_FAST_VISIT', 'TOO_LONG_VISIT', 'INCONSISTENT_FINISH', 'SYNC_FAILURE');

-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEW', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" "RoleCode" NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "role_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervisors" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "ProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "region" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supervisors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promoters" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "supervisor_id" TEXT,
    "status" "ProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promoters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RouteStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_date" TIMESTAMP(3),
    "supervisor_id" TEXT,
    "promoter_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_items" (
    "id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "RouteItemStatus" NOT NULL DEFAULT 'PLANNED',
    "planned_start" TIMESTAMP(3),
    "planned_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "route_id" TEXT,
    "route_item_id" TEXT,
    "client_id" TEXT NOT NULL,
    "promoter_id" TEXT,
    "status" "VisitStatus" NOT NULL DEFAULT 'pending',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "gps_latitude" DECIMAL(10,7),
    "gps_longitude" DECIMAL(10,7),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_photos" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "type" "PhotoType" NOT NULL,
    "url" TEXT NOT NULL,
    "storage_key" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_occurrences" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "type" "SyncType" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'pending',
    "user_id" TEXT,
    "entity_type" "SyncEntityType",
    "entity_id" TEXT,
    "summary" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_trackings" (
    "id" TEXT NOT NULL,
    "entity_type" "SyncEntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3),
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_trackings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_flags" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "type" "AuditFlagType" NOT NULL,
    "severity" "AuditSeverity" NOT NULL DEFAULT 'MEDIUM',
    "details" JSONB,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "replaced_by_token_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_import_logs" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "failed_rows" INTEGER NOT NULL DEFAULT 0,
    "preview" JSONB,
    "errors" JSONB,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_import_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "supervisors_user_id_key" ON "supervisors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "promoters_user_id_key" ON "promoters"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "clients_code_key" ON "clients"("code");

-- CreateIndex
CREATE INDEX "clients_name_idx" ON "clients"("name");

-- CreateIndex
CREATE UNIQUE INDEX "route_items_route_id_sequence_key" ON "route_items"("route_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "sync_trackings_entity_type_entity_id_key" ON "sync_trackings"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisors" ADD CONSTRAINT "supervisors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promoters" ADD CONSTRAINT "promoters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promoters" ADD CONSTRAINT "promoters_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "supervisors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "supervisors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_promoter_id_fkey" FOREIGN KEY ("promoter_id") REFERENCES "promoters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_items" ADD CONSTRAINT "route_items_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_items" ADD CONSTRAINT "route_items_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_route_item_id_fkey" FOREIGN KEY ("route_item_id") REFERENCES "route_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_promoter_id_fkey" FOREIGN KEY ("promoter_id") REFERENCES "promoters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_photos" ADD CONSTRAINT "visit_photos_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_occurrences" ADD CONSTRAINT "visit_occurrences_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_flags" ADD CONSTRAINT "audit_flags_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_import_logs" ADD CONSTRAINT "client_import_logs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

