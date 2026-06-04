ALTER TABLE "visits" ADD COLUMN "client_generated_id" TEXT;
ALTER TABLE "visit_photos" ADD COLUMN "client_generated_id" TEXT;

CREATE UNIQUE INDEX "visits_client_generated_id_key" ON "visits"("client_generated_id");
CREATE UNIQUE INDEX "visit_photos_client_generated_id_key" ON "visit_photos"("client_generated_id");
