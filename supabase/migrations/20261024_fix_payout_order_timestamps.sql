-- Repair installations that already ran 20261023_controlled_payouts.sql.
-- No order, payment, batch, or automation mode is changed.
BEGIN;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payout_processing_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_paid_at timestamptz;
COMMIT;
