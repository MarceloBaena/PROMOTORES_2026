CREATE TYPE "SupplierExecutionStatus" AS ENUM ('pending', 'in_progress', 'completed', 'skipped');

ALTER TYPE "PhotoType" ADD VALUE 'supplier_before';
ALTER TYPE "PhotoType" ADD VALUE 'supplier_after';
ALTER TYPE "PhotoType" ADD VALUE 'leaflet';
ALTER TYPE "PhotoType" ADD VALUE 'gondola';
ALTER TYPE "PhotoType" ADD VALUE 'display';
ALTER TYPE "PhotoType" ADD VALUE 'island';
ALTER TYPE "PhotoType" ADD VALUE 'promotional_material';
ALTER TYPE "PhotoType" ADD VALUE 'checkout';
ALTER TYPE "PhotoType" ADD VALUE 'store_extra';

ALTER TYPE "AuditFlagType" ADD VALUE 'SUPPLIER_MISSING_BEFORE_PHOTO';
ALTER TYPE "AuditFlagType" ADD VALUE 'SUPPLIER_MISSING_AFTER_PHOTO';
ALTER TYPE "AuditFlagType" ADD VALUE 'SUPPLIER_MISSING_DELIVERY_RESPONSE';
ALTER TYPE "AuditFlagType" ADD VALUE 'SUPPLIER_MISSING_REPLENISHMENT_RESPONSE';
ALTER TYPE "AuditFlagType" ADD VALUE 'SUPPLIER_MISSING_STOCKOUT_RESPONSE';
ALTER TYPE "AuditFlagType" ADD VALUE 'SUPPLIER_TOO_FAST';
ALTER TYPE "AuditFlagType" ADD VALUE 'CHECKOUT_WITH_PENDING_SUPPLIER';

CREATE TABLE "supplier_executions" (
  "id" TEXT NOT NULL,
  "client_generated_id" TEXT,
  "company_id" TEXT,
  "visit_id" TEXT NOT NULL,
  "supplier_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "promoter_id" TEXT,
  "status" "SupplierExecutionStatus" NOT NULL DEFAULT 'pending',
  "delivery_received" BOOLEAN,
  "products_replenished" BOOLEAN,
  "stockout_found" BOOLEAN,
  "notes" TEXT,
  "before_photo_id" TEXT,
  "after_photo_id" TEXT,
  "started_at_device" TIMESTAMP(3),
  "finished_at_device" TIMESTAMP(3),
  "sync_status" "SyncStatus" NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "supplier_executions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_execution_products" (
  "id" TEXT NOT NULL,
  "supplier_execution_id" TEXT NOT NULL,
  "product_id" TEXT,
  "stock_quantity" DECIMAL(12,2),
  "facing" INTEGER,
  "rupture" BOOLEAN,
  "price" DECIMAL(12,2),
  "promotion" BOOLEAN,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "supplier_execution_products_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "visit_photos"
  ADD COLUMN "supplier_execution_id" TEXT,
  ADD COLUMN "supplier_id" TEXT,
  ADD COLUMN "captured_at_device" TIMESTAMP(3),
  ADD COLUMN "sync_status" "SyncStatus" NOT NULL DEFAULT 'pending';

CREATE UNIQUE INDEX "supplier_executions_client_generated_id_key" ON "supplier_executions"("client_generated_id");
CREATE INDEX "supplier_executions_company_id_idx" ON "supplier_executions"("company_id");
CREATE INDEX "supplier_executions_visit_id_status_idx" ON "supplier_executions"("visit_id", "status");
CREATE INDEX "supplier_executions_client_id_supplier_id_idx" ON "supplier_executions"("client_id", "supplier_id");
CREATE INDEX "supplier_execution_products_supplier_execution_id_idx" ON "supplier_execution_products"("supplier_execution_id");
CREATE INDEX "visit_photos_supplier_execution_id_idx" ON "visit_photos"("supplier_execution_id");
CREATE INDEX "visit_photos_supplier_id_idx" ON "visit_photos"("supplier_id");

ALTER TABLE "supplier_executions"
  ADD CONSTRAINT "supplier_executions_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "supplier_executions"
  ADD CONSTRAINT "supplier_executions_visit_id_fkey"
  FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_executions"
  ADD CONSTRAINT "supplier_executions_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_executions"
  ADD CONSTRAINT "supplier_executions_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_executions"
  ADD CONSTRAINT "supplier_executions_promoter_id_fkey"
  FOREIGN KEY ("promoter_id") REFERENCES "promoters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "supplier_execution_products"
  ADD CONSTRAINT "supplier_execution_products_supplier_execution_id_fkey"
  FOREIGN KEY ("supplier_execution_id") REFERENCES "supplier_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "visit_photos"
  ADD CONSTRAINT "visit_photos_supplier_execution_id_fkey"
  FOREIGN KEY ("supplier_execution_id") REFERENCES "supplier_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "visit_photos"
  ADD CONSTRAINT "visit_photos_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
