ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "trade_name" TEXT;

CREATE INDEX IF NOT EXISTS "clients_trade_name_idx" ON "clients"("trade_name");
