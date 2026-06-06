ALTER TABLE "clients" ADD COLUMN "address_number" TEXT;
ALTER TABLE "clients" ADD COLUMN "district" TEXT;
ALTER TABLE "clients" ADD COLUMN "default_promoter_id" TEXT;

CREATE INDEX "clients_default_promoter_id_idx" ON "clients"("default_promoter_id");

ALTER TABLE "clients" ADD CONSTRAINT "clients_default_promoter_id_fkey"
  FOREIGN KEY ("default_promoter_id") REFERENCES "promoters"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
