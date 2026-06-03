ALTER TABLE "Visit"
  ADD COLUMN "serviceStartedAt" TIMESTAMP(3),
  ADD COLUMN "serviceStartEventId" TEXT;

CREATE UNIQUE INDEX "Visit_serviceStartEventId_key"
  ON "Visit"("serviceStartEventId");
