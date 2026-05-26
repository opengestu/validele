-- Allow public read access to vendor display profiles for product lookup.
-- This supports showing vendor/boutique names in the buyer UI.
CREATE POLICY "Public can read vendor profiles for available products"
ON public.profiles
FOR SELECT
TO public
USING (
  role = 'vendor'
  AND EXISTS (
    SELECT 1
    FROM public.products
    WHERE products.vendor_id = profiles.id
      AND products.is_available = true
  )
);
