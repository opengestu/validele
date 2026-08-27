-- Migration : marquage « démo » (test mode) sur le catalogue et les commandes.
-- À exécuter dans l'éditeur SQL Supabase (ou via psql), APRÈS la 008.
--
-- Principe (identique au « test mode » de Stripe) : la démo n'est pas une copie
-- de l'application, c'est le MÊME parcours dont les données sont marquées. Ce
-- drapeau sert ensuite à exclure la démo de l'argent réel et des vrais chiffres,
-- sans jamais dupliquer de code.
--
-- Qui pose le drapeau :
--   profiles.is_demo / products.is_demo -> le script backend/scripts/seed-demo-catalog.js
--   orders.is_demo                      -> POST /api/guest/order, dérivé de
--                                          orders.bot_number (migration 008) via
--                                          backend/demo.js, ou d'un produit démo.
--
-- FALSE par défaut partout : toutes les lignes existantes restent des vraies
-- données, aucun comportement ne change tant que rien n'est marqué.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- Les commandes démo sont peu nombreuses face aux vraies : un index partiel suffit
-- (il n'indexe QUE les lignes démo) pour les écarter sans coût sur la prod.
CREATE INDEX IF NOT EXISTS orders_is_demo_idx ON orders (is_demo) WHERE is_demo;
