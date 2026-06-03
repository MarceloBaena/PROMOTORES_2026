CREATE TYPE "VisitPhotoStage" AS ENUM ('CHECKIN', 'BEFORE', 'AFTER', 'OCCURRENCE_EXTRA');
CREATE TYPE "PhotoGpsStatus" AS ENUM ('CAPTURED', 'UNAVAILABLE', 'PERMISSION_DENIED');

ALTER TABLE "VisitPhoto"
  ADD COLUMN "stage" "VisitPhotoStage",
  ADD COLUMN "capturedLatitude" DOUBLE PRECISION,
  ADD COLUMN "capturedLongitude" DOUBLE PRECISION,
  ADD COLUMN "gpsStatus" "PhotoGpsStatus",
  ADD COLUMN "gpsErrorCode" TEXT,
  ADD COLUMN "gpsErrorMessage" TEXT;

UPDATE "VisitPhoto"
SET "stage" = CASE
  WHEN "category" = 'CHECKIN_ESTABLISHMENT' THEN 'CHECKIN'::"VisitPhotoStage"
  WHEN "type" = 'AFTER' THEN 'AFTER'::"VisitPhotoStage"
  ELSE 'BEFORE'::"VisitPhotoStage"
END;

ALTER TABLE "VisitPhoto"
  ALTER COLUMN "stage" SET NOT NULL;

CREATE INDEX "VisitPhoto_visitId_stage_idx" ON "VisitPhoto"("visitId", "stage");
