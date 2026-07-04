CREATE TYPE "CategoryStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "product_categories" (
  "id" TEXT NOT NULL,
  "code" SERIAL NOT NULL,
  "company_id" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "CategoryStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_product_categories" (
  "id" TEXT NOT NULL,
  "supplier_id" TEXT NOT NULL,
  "category_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "supplier_product_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_categories_code_key" ON "product_categories"("code");
CREATE INDEX "product_categories_company_id_idx" ON "product_categories"("company_id");
CREATE INDEX "product_categories_company_id_status_idx" ON "product_categories"("company_id", "status");
CREATE INDEX "product_categories_name_idx" ON "product_categories"("name");
CREATE UNIQUE INDEX "product_categories_company_id_name_key" ON "product_categories"("company_id", "name");

CREATE INDEX "supplier_product_categories_category_id_idx" ON "supplier_product_categories"("category_id");
CREATE UNIQUE INDEX "supplier_product_categories_supplier_id_category_id_key" ON "supplier_product_categories"("supplier_id", "category_id");

ALTER TABLE "product_categories"
  ADD CONSTRAINT "product_categories_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "supplier_product_categories"
  ADD CONSTRAINT "supplier_product_categories_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_product_categories"
  ADD CONSTRAINT "supplier_product_categories_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
