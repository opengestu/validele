-- Add FK from payment_transactions.order_id to orders.id
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT IF NOT EXISTS fk_payment_transactions_order
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

-- Add index for faster joins
CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id ON public.payment_transactions(order_id);

-- Verify
SELECT order_id, count(*) FROM public.payment_transactions GROUP BY order_id LIMIT 10;