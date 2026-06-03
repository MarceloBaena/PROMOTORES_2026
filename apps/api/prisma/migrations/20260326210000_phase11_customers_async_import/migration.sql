DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'QUEUED'
      AND enumtypid = '"CustomerImportBatchStatus"'::regtype
  ) THEN
    ALTER TYPE "CustomerImportBatchStatus" ADD VALUE 'QUEUED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'PROCESSING'
      AND enumtypid = '"CustomerImportBatchStatus"'::regtype
  ) THEN
    ALTER TYPE "CustomerImportBatchStatus" ADD VALUE 'PROCESSING';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'RETRY_SCHEDULED'
      AND enumtypid = '"CustomerImportBatchStatus"'::regtype
  ) THEN
    ALTER TYPE "CustomerImportBatchStatus" ADD VALUE 'RETRY_SCHEDULED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'STAGED'
      AND enumtypid = '"CustomerImportItemStatus"'::regtype
  ) THEN
    ALTER TYPE "CustomerImportItemStatus" ADD VALUE 'STAGED';
  END IF;
END $$;

ALTER TABLE "CustomerImportBatch"
ADD COLUMN IF NOT EXISTS "sourceReference" TEXT,
ADD COLUMN IF NOT EXISTS "requestPayload" JSONB,
ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "durationMs" INTEGER,
ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "nextRetryAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastError" TEXT;

ALTER TABLE "CustomerImportItem"
ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerImportItem_batchId_rowNumber_key"
ON "CustomerImportItem"("batchId", "rowNumber");

CREATE INDEX IF NOT EXISTS "CustomerImportBatch_companyId_status_requestedAt_idx"
ON "CustomerImportBatch"("companyId", "status", "requestedAt");

CREATE INDEX IF NOT EXISTS "CustomerImportBatch_status_nextRetryAt_requestedAt_idx"
ON "CustomerImportBatch"("status", "nextRetryAt", "requestedAt");

CREATE INDEX IF NOT EXISTS "CustomerImportItem_batchId_status_rowNumber_idx"
ON "CustomerImportItem"("batchId", "status", "rowNumber");
