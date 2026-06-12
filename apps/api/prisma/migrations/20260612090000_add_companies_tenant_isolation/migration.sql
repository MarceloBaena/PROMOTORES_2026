CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "companies" (
  "id" TEXT NOT NULL,
  "code" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "document" TEXT,
  "contact_name" TEXT,
  "contact_phone" TEXT,
  "contact_email" TEXT,
  "address" TEXT,
  "address_number" TEXT,
  "district" TEXT,
  "city" TEXT,
  "state" TEXT,
  "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "companies_code_key" ON "companies"("code");
CREATE INDEX "companies_name_idx" ON "companies"("name");

ALTER TABLE "users" ADD COLUMN "company_id" TEXT;
ALTER TABLE "supervisors" ADD COLUMN "company_id" TEXT;
ALTER TABLE "promoters" ADD COLUMN "company_id" TEXT;
ALTER TABLE "clients" ADD COLUMN "company_id" TEXT;
ALTER TABLE "routes" ADD COLUMN "company_id" TEXT;
ALTER TABLE "visits" ADD COLUMN "company_id" TEXT;
ALTER TABLE "promoter_locations" ADD COLUMN "company_id" TEXT;
ALTER TABLE "sync_logs" ADD COLUMN "company_id" TEXT;
ALTER TABLE "client_import_logs" ADD COLUMN "company_id" TEXT;

DROP INDEX IF EXISTS "clients_code_key";
CREATE UNIQUE INDEX "clients_company_id_code_key" ON "clients"("company_id", "code");

CREATE INDEX "users_company_id_idx" ON "users"("company_id");
CREATE INDEX "supervisors_company_id_idx" ON "supervisors"("company_id");
CREATE INDEX "promoters_company_id_idx" ON "promoters"("company_id");
CREATE INDEX "clients_company_id_idx" ON "clients"("company_id");
CREATE INDEX "routes_company_id_idx" ON "routes"("company_id");
CREATE INDEX "visits_company_id_idx" ON "visits"("company_id");
CREATE INDEX "promoter_locations_company_id_idx" ON "promoter_locations"("company_id");
CREATE INDEX "sync_logs_company_id_idx" ON "sync_logs"("company_id");
CREATE INDEX "client_import_logs_company_id_idx" ON "client_import_logs"("company_id");

ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "supervisors" ADD CONSTRAINT "supervisors_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "promoters" ADD CONSTRAINT "promoters_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "clients" ADD CONSTRAINT "clients_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "routes" ADD CONSTRAINT "routes_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "visits" ADD CONSTRAINT "visits_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "promoter_locations" ADD CONSTRAINT "promoter_locations_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "client_import_logs" ADD CONSTRAINT "client_import_logs_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
