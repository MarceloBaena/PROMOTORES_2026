CREATE TYPE "SyncOperationStatus" AS ENUM ('RECEIVED', 'SYNCING', 'SYNCED', 'FAILED');

CREATE TABLE "sync_operations" (
  "id" TEXT NOT NULL,
  "promoterId" TEXT NOT NULL,
  "device_id" TEXT,
  "action_id" TEXT,
  "client_generated_id" TEXT NOT NULL,
  "action_type" TEXT NOT NULL,
  "route_stop_id" TEXT,
  "visit_id" TEXT,
  "payload_hash" TEXT NOT NULL,
  "request_payload" JSONB NOT NULL,
  "response_payload" JSONB,
  "server_entity_id" TEXT,
  "status" "SyncOperationStatus" NOT NULL DEFAULT 'RECEIVED',
  "last_error" TEXT,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "sync_operations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sync_operations_promoterId_client_generated_id_key"
  ON "sync_operations"("promoterId", "client_generated_id");

CREATE INDEX "sync_operations_promoterId_status_updated_at_idx"
  ON "sync_operations"("promoterId", "status", "updated_at");

CREATE INDEX "sync_operations_promoterId_created_at_idx"
  ON "sync_operations"("promoterId", "created_at");

CREATE INDEX "sync_operations_device_id_created_at_idx"
  ON "sync_operations"("device_id", "created_at");

ALTER TABLE "sync_operations"
  ADD CONSTRAINT "sync_operations_promoterId_fkey"
  FOREIGN KEY ("promoterId")
  REFERENCES "Promoter"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
