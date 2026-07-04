CREATE TYPE "ActivityStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "client_activity_types" (
  "id" TEXT NOT NULL,
  "code" SERIAL NOT NULL,
  "company_id" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "ActivityStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "client_activity_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_activity_assignments" (
  "id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "activity_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "client_activity_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_activity_types_code_key" ON "client_activity_types"("code");
CREATE UNIQUE INDEX "client_activity_types_company_id_name_key" ON "client_activity_types"("company_id", "name");
CREATE INDEX "client_activity_types_company_id_idx" ON "client_activity_types"("company_id");
CREATE INDEX "client_activity_types_company_id_status_idx" ON "client_activity_types"("company_id", "status");
CREATE INDEX "client_activity_types_name_idx" ON "client_activity_types"("name");

CREATE UNIQUE INDEX "client_activity_assignments_client_id_activity_id_key"
  ON "client_activity_assignments"("client_id", "activity_id");
CREATE INDEX "client_activity_assignments_activity_id_idx"
  ON "client_activity_assignments"("activity_id");

ALTER TABLE "client_activity_types"
  ADD CONSTRAINT "client_activity_types_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "client_activity_assignments"
  ADD CONSTRAINT "client_activity_assignments_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "client_activity_assignments"
  ADD CONSTRAINT "client_activity_assignments_activity_id_fkey"
  FOREIGN KEY ("activity_id") REFERENCES "client_activity_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
