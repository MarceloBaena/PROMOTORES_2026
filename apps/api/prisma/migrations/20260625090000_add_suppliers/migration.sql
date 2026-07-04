CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "suppliers" (
  "id" TEXT NOT NULL,
  "company_id" TEXT,
  "name" TEXT NOT NULL,
  "trade_name" TEXT,
  "document" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "contact_name" TEXT,
  "notes" TEXT,
  "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_suppliers" (
  "id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "supplier_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "client_suppliers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "suppliers_company_id_idx" ON "suppliers"("company_id");
CREATE INDEX "suppliers_company_id_status_idx" ON "suppliers"("company_id", "status");
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");
CREATE UNIQUE INDEX "suppliers_company_document_unique" ON "suppliers"("company_id", "document") WHERE "document" IS NOT NULL;

CREATE INDEX "client_suppliers_supplier_id_idx" ON "client_suppliers"("supplier_id");
CREATE UNIQUE INDEX "client_suppliers_client_id_supplier_id_key" ON "client_suppliers"("client_id", "supplier_id");

ALTER TABLE "suppliers"
  ADD CONSTRAINT "suppliers_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "client_suppliers"
  ADD CONSTRAINT "client_suppliers_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "client_suppliers"
  ADD CONSTRAINT "client_suppliers_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
