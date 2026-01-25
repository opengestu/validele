-- Add provider and batch tracing columns to payment_transactions
ALTER TABLE IF EXISTS payment_transactions
  ADD COLUMN IF NOT EXISTS provider_response jsonb,
  ADD COLUMN IF NOT EXISTS provider_error text,
  ADD COLUMN IF NOT EXISTS provider_transaction_id text,
  ADD COLUMN IF NOT EXISTS batch_id uuid;

-- Add index on batch_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_transactions_batch_id ON payment_transactions(batch_id);

-- Optional: make sure order_id can be null (some payouts will be tied to a batch)
ALTER TABLE IF EXISTS payment_transactions
  ALTER COLUMN order_id DROP NOT NULL;