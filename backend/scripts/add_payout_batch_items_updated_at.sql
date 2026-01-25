-- Add updated_at timestamp to payout_batch_items for audit/update tracking
ALTER TABLE IF EXISTS payout_batch_items
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Optionally backfill existing rows updated_at to created_at if desired
-- UPDATE payout_batch_items SET updated_at = COALESCE(updated_at, created_at);