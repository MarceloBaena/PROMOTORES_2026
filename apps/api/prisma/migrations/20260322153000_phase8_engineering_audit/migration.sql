-- Query support for alert deduplication and supervisor reads.
CREATE INDEX "Alert_type_promoterId_clientId_visitId_active_resolvedAt_idx"
ON "Alert"("type", "promoterId", "clientId", "visitId", "active", "resolvedAt");

-- Prevent concurrent creation of more than one active journey per promoter.
CREATE UNIQUE INDEX "Journey_single_active_promoter_idx"
ON "Journey"("promoterId")
WHERE "active" = true;
