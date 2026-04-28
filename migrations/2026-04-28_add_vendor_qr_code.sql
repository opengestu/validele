-- Migration: Ajout du champ qr_code_vendor dans la table orders
ALTER TABLE orders ADD COLUMN qr_code_vendor VARCHAR(255);
-- Facultatif: index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_orders_qr_code_vendor ON orders(qr_code_vendor);
