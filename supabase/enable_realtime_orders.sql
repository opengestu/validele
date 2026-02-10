-- Enable Realtime publication for orders and add RLS policies

-- 1) Ensure primary key exists (example uses uuid)
-- Execute only if your table doesn't already have a PK
-- ALTER TABLE public.orders ADD COLUMN id uuid PRIMARY KEY DEFAULT gen_random_uuid();

-- 2) Create publication used by Supabase Realtime
CREATE PUBLICATION IF NOT EXISTS supabase_realtime_orders FOR TABLE public.orders;

-- 3) Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 4) Basic RLS policies
-- Vendor: can select orders where vendor_id matches their auth uid
CREATE POLICY IF NOT EXISTS vendors_select_own_orders ON public.orders
  FOR SELECT USING (vendor_id = auth.uid());

-- Buyer: can select orders where buyer_id matches their auth uid
CREATE POLICY IF NOT EXISTS buyers_select_own_orders ON public.orders
  FOR SELECT USING (buyer_id = auth.uid());

-- Admin: read all when profile.role = 'admin'
CREATE POLICY IF NOT EXISTS admins_select_all_orders ON public.orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- 5) Optional: vendor may update their own orders (adjust as needed)
CREATE POLICY IF NOT EXISTS vendors_update_own_orders ON public.orders
  FOR UPDATE USING (vendor_id = auth.uid());

-- Notes:
-- - Run these statements in Supabase SQL editor (Database -> SQL Editor).
-- - Verify publication is listed: SELECT * FROM pg_publication;
-- - Test RLS by making realtime subscriptions and checking events in the client.
