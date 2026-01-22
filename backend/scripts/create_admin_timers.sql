-- Create admin_timers table to track admin-started countdowns
CREATE TABLE IF NOT EXISTS public.admin_timers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz DEFAULT now(),
  duration_seconds int NOT NULL,
  active boolean DEFAULT true,
  message text
);

-- Index for quick active timers lookup
CREATE INDEX IF NOT EXISTS idx_admin_timers_active ON public.admin_timers(active, started_at);

SELECT * FROM public.admin_timers LIMIT 1;