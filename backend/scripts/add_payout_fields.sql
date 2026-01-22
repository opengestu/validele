-- Add payout tracking fields to orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payout_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payout_requested_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payout_requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_orders_payout_status ON public.orders(payout_status, payout_requested_at);

SELECT id, order_code, status, payout_status, payout_requested_at FROM public.orders LIMIT 5;