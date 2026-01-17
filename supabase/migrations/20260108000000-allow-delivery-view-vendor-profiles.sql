-- Migration pour permettre aux livreurs de voir les profils vendeur(se)s
-- Nécessaire pour pouvoir payer les vendeur(se)s après livraison

-- Supprimer l'ancienne politique restrictive si elle existe
DROP POLICY IF EXISTS "Delivery persons can view customer profiles" ON public.profiles;

-- Créer une nouvelle politique qui permet aux livreurs de voir :
-- 1. Leur propre profil
-- 2. Les profils des clients (buyers) des commandes qu'ils livrent
-- 3. Les profils des vendeur(se)s des commandes qu'ils livrent
CREATE POLICY "Delivery persons can view customer and vendor profiles" 
ON public.profiles FOR SELECT 
USING (
  -- Les utilisateurs peuvent voir leur propre profil
  (auth.uid() = id) OR
  -- Les livreurs peuvent voir les profils des clients ET vendeur(se)s pour la livraison
  (EXISTS (
    SELECT 1 FROM public.orders 
    WHERE (orders.buyer_id = profiles.id OR orders.vendor_id = profiles.id)
    AND orders.delivery_person_id = auth.uid()
  ))
);
