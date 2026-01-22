-- Create admin_users table and insert an admin user
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Insert the admin user (replace the UUID if needed)
INSERT INTO public.admin_users (id)
VALUES ('5153f7fc-8585-40d7-9557-f347bd21bcee')
ON CONFLICT DO NOTHING;

-- Verify
SELECT * FROM public.admin_users;
