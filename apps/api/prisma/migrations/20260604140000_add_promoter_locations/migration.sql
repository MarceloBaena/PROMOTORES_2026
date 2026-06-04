CREATE TABLE "promoter_locations" (
    "id" TEXT NOT NULL,
    "promoter_id" TEXT NOT NULL,
    "visit_id" TEXT,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "accuracy_meters" DECIMAL(10,2),
    "captured_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'mobile',

    CONSTRAINT "promoter_locations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "promoter_locations_promoter_id_captured_at_idx" ON "promoter_locations"("promoter_id", "captured_at");
CREATE INDEX "promoter_locations_visit_id_idx" ON "promoter_locations"("visit_id");

ALTER TABLE "promoter_locations"
ADD CONSTRAINT "promoter_locations_promoter_id_fkey"
FOREIGN KEY ("promoter_id") REFERENCES "promoters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "promoter_locations"
ADD CONSTRAINT "promoter_locations_visit_id_fkey"
FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
