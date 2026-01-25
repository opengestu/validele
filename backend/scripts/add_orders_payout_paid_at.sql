-- Add payout_paid_at column to orders to record when a payout was completed
ALTER TABLE IF EXISTS orders
  ADD COLUMN IF NOT EXISTS payout_paid_at timestamptz;

-- Optional: backfill payouts for orders that already have payout_status = 'paid' if you have a reliable timestamp
-- UPDATE orders SET payout_paid_at = COALESCE(payout_paid_at, now()) WHERE payout_status = 'paid' AND payout_paid_at IS NULL;