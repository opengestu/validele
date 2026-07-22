-- Migration: montant du frais de protection encaissé, stocké sur la commande
-- À exécuter dans l'éditeur SQL Supabase (ou via psql).
--
-- Le frais de protection acheteur (paiement invité) est NON remboursable. On le
-- stocke sur la commande au moment de l'achat pour le déduire précisément lors
-- d'un remboursement (remboursement = total payé - protection_fee), sans dépendre
-- du pourcentage courant (qui peut changer). 0 par défaut : commandes app /
-- anciennes sans frais -> remboursement = total, comportement inchangé.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS protection_fee numeric NOT NULL DEFAULT 0;
