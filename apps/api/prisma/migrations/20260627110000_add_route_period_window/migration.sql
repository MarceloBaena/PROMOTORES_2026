ALTER TABLE "routes"
  ADD COLUMN IF NOT EXISTS "start_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "end_date" TIMESTAMP(3);

UPDATE "routes"
SET
  "start_date" = COALESCE("start_date", "scheduled_date", "created_at"),
  "end_date" = COALESCE(
    "end_date",
    CASE
      WHEN "scheduled_date" IS NOT NULL THEN date_trunc('day', "scheduled_date") + interval '1 day' - interval '1 millisecond'
      ELSE date_trunc('day', "created_at") + interval '1 day' - interval '1 millisecond'
    END
  )
WHERE "start_date" IS NULL
   OR "end_date" IS NULL;

CREATE INDEX IF NOT EXISTS "routes_company_id_promoter_id_status_start_date_end_date_idx"
  ON "routes"("company_id", "promoter_id", "status", "start_date", "end_date");
