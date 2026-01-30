-- Migration: Add orders_audit table and trigger
-- Generated: 2026-01-30

-- Create audit table
CREATE TABLE IF NOT EXISTS public.orders_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  changed_at timestamptz DEFAULT now(),
  operation text,
  old_row jsonb,
  new_row jsonb,
  changed_by text,
  source text
);

-- Create function for audit trigger
CREATE OR REPLACE FUNCTION public.orders_audit_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.orders_audit(order_id, operation, old_row, new_row, changed_by, source)
  VALUES (
    COALESCE(OLD.id, NEW.id),
    TG_OP,
    to_jsonb(OLD),
    to_jsonb(NEW),
    -- Try to capture JWT subject if set by PostgREST / Supabase
    current_setting('request.jwt.claims.sub', true),
    current_setting('request.jwt.claims', true)
  );
  RETURN NEW;
END;
$$;

-- Drop existing trigger if present and create a new one
DROP TRIGGER IF EXISTS orders_audit_trg ON public.orders;
CREATE TRIGGER orders_audit_trg
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_audit_fn();

-- Optional: create index to quickly query by order_id
CREATE INDEX IF NOT EXISTS idx_orders_audit_order_id ON public.orders_audit(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_audit_changed_at ON public.orders_audit(changed_at DESC);
