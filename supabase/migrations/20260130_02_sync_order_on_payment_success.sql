-- Migration: Sync orders when payment_transactions become SUCCESSFUL
-- Generated: 2026-01-30

-- Function executed by trigger on payment_transactions
CREATE OR REPLACE FUNCTION public.payment_transactions_sync_orders_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Only act on UPDATE when status changed to 'SUCCESSFUL'
  IF TG_OP = 'UPDATE' AND NEW.status = 'SUCCESSFUL' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    -- If the transaction references a single order, mark it paid
    IF NEW.order_id IS NOT NULL THEN
      UPDATE public.orders
      SET payout_status = 'paid', payout_paid_at = now()
      WHERE id = NEW.order_id AND (payout_status IS NULL OR payout_status <> 'paid');
    END IF;

    -- If the transaction references a batch, mark batch items and related orders as paid
    IF NEW.batch_id IS NOT NULL THEN
      UPDATE public.payout_batch_items
      SET status = 'paid'
      WHERE batch_id = NEW.batch_id;

      UPDATE public.orders
      SET payout_status = 'paid', payout_paid_at = now()
      WHERE id IN (
        SELECT order_id FROM public.payout_batch_items WHERE batch_id = NEW.batch_id AND order_id IS NOT NULL
      ) AND (payout_status IS NULL OR payout_status <> 'paid');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any and create new one
DROP TRIGGER IF EXISTS payment_transactions_sync_orders_trg ON public.payment_transactions;
CREATE TRIGGER payment_transactions_sync_orders_trg
AFTER UPDATE ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION public.payment_transactions_sync_orders_fn();

-- Indexes to help performance (optional)
CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id ON public.payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_batch_id ON public.payment_transactions(batch_id);
