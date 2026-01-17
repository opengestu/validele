-- Commande SQL pour permettre aux livreurs de voir les commandes
-- À exécuter dans l'interface SQL de Supabase

-- 1. Supprimer l'ancienne politique restrictive
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;

-- 2. Créer une nouvelle politique qui permet aux livreurs de voir toutes les commandes
CREATE POLICY "Delivery can view all orders" 
ON public.orders FOR SELECT 
USING (
  -- Les acheteurs peuvent voir leurs propres commandes
  (auth.uid() = buyer_id) OR
  -- Les vendeur(se)s peuvent voir leurs propres commandes  
  (auth.uid() = vendor_id) OR
  -- Les livreurs peuvent voir TOUTES les commandes
  (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'delivery'
  ))
);

-- 3. Permettre aux livreurs de modifier les commandes (pour s'assigner)
CREATE POLICY "Delivery can update orders" 
ON public.orders FOR UPDATE 
USING (
  (auth.uid() = vendor_id) OR
  (auth.uid() = delivery_person_id) OR
  (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'delivery'
  ))
);

-- 4. Permettre aux livreurs de voir les profils des clients
CREATE POLICY "Delivery can view customer profiles" 
ON public.profiles FOR SELECT 
USING (
  (auth.uid() = id) OR
  (EXISTS (
    SELECT 1 FROM public.profiles AS delivery_profile
    WHERE delivery_profile.id = auth.uid() 
    AND delivery_profile.role = 'delivery'
  ))
); 