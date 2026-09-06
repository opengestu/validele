-- Restrict public vendor profile access to company_name only.
DROP POLICY IF EXISTS "Public can read vendor profiles for available products" ON public.profiles;

CREATE POLICY "Anon can read vendor company names for available products"
ON public.profiles
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.products
    WHERE products.vendor_id = profiles.id
      AND products.is_available = true
  )
);

-- Limit anon column access to only id + company_name.
REVOKE SELECT ON public.profiles FROM PUBLIC;
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, company_name) ON public.profiles TO anon;

-- Keep full column access for authenticated users (still gated by RLS).
GRANT SELECT ON public.profiles TO authenticated;
