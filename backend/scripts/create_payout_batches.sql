-- Create payout_batches and payout_batch_items tables
CREATE TABLE IF NOT EXISTS public.payout_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled', -- scheduled|processing|completed|failed|cancelled
  total_amount bigint DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payout_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.payout_batches(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  amount bigint NOT NULL,
  status text NOT NULL DEFAULT 'queued', -- queued|processing|paid|failed
  provider_transaction_id text,
  provider_response jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_batches_status ON public.payout_batches(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_payout_batch_items_batch ON public.payout_batch_items(batch_id, status);

SELECT * FROM public.payout_batches LIMIT 1;