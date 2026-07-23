-- Garantit la colonne quantity sur orders.
-- La colonne existe déjà en production (utilisée par l'app mobile / BuyerDashboard) ;
-- cette migration est idempotente et sert surtout à une base neuve, et à aligner le
-- checkout invité web (/api/guest/order), qui enregistre désormais la quantité choisie.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
