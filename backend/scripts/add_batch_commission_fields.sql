-- Add commission fields to payout_batches and payout_batch_items
ALTER TABLE IF EXISTS payout_batches
  ADD COLUMN IF NOT EXISTS commission_pct numeric DEFAULT 0;

ALTER TABLE IF EXISTS payout_batch_items
  ADD COLUMN IF NOT EXISTS commission_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount numeric DEFAULT 0;

-- Index for queries by commission_pct if needed
CREATE INDEX IF NOT EXISTS idx_payout_batches_commission_pct ON payout_batches(commission_pct);