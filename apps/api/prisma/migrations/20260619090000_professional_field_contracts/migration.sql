ALTER TYPE "VisitStatus" ADD VALUE IF NOT EXISTS 'canceled';
ALTER TYPE "AuditFlagType" ADD VALUE IF NOT EXISTS 'POSSIBLE_DUPLICATE_PHOTO';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OccurrenceType') THEN
    CREATE TYPE "OccurrenceType" AS ENUM (
      'store_closed',
      'manager_absent',
      'rupture',
      'no_stock',
      'price_issue',
      'competitor_action',
      'other'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OccurrenceStatus') THEN
    CREATE TYPE "OccurrenceStatus" AS ENUM (
      'open',
      'in_review',
      'resolved',
      'rejected'
    );
  END IF;
END $$;

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "geofence_radius_m" INTEGER NOT NULL DEFAULT 150;

ALTER TABLE "visits"
  ADD COLUMN IF NOT EXISTS "gps_accuracy_meters" DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS "location_permission_status" TEXT;

ALTER TABLE "visit_occurrences"
  ADD COLUMN IF NOT EXISTS "type" "OccurrenceType" NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS "status" "OccurrenceStatus" NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS "resolution_note" TEXT,
  ADD COLUMN IF NOT EXISTS "viewed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMP(3);

ALTER TABLE "audit_flags"
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "resolved_by" TEXT,
  ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolution_note" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_flags_resolved_by_fkey'
  ) THEN
    ALTER TABLE "audit_flags"
      ADD CONSTRAINT "audit_flags_resolved_by_fkey"
      FOREIGN KEY ("resolved_by") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "audit_flags_resolved_idx" ON "audit_flags"("resolved");
CREATE INDEX IF NOT EXISTS "audit_flags_resolved_by_idx" ON "audit_flags"("resolved_by");
