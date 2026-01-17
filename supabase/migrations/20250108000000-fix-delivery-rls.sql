-- Migration pour corriger les règles RLS pour les livreurs
-- Permettre aux livreurs de voir toutes les commandes disponibles pour la livraison

-- Supprimer l'ancienne politique restrictive
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;

-- Créer une nouvelle politique plus permissive pour les livreurs
CREATE POLICY "Users can view orders based on role" 
ON public.orders FOR SELECT 
USING (
  -- Les acheteurs peuvent voir leurs propres commandes
  (auth.uid() = buyer_id) OR
  -- Les vendeur(se)s peuvent voir leurs propres commandes
  (auth.uid() = vendor_id) OR
  -- Les livreurs peuvent voir toutes les commandes (pour pouvoir les prendre en charge)
  (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'delivery'
  ))
);

-- Ajouter une politique spécifique pour permettre aux livreurs de prendre en charge des commandes
CREATE POLICY "Delivery persons can take orders" 
ON public.orders FOR UPDATE 
USING (
  -- Les vendeur(se)s peuvent modifier leurs commandes
  (auth.uid() = vendor_id) OR
  -- Les livreurs peuvent modifier les commandes (pour s'assigner ou marquer comme livrées)
  (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'delivery'
  ))
);

-- Ajouter une politique pour permettre aux livreurs de voir les profils des clients
-- (nécessaire pour afficher les informations de livraison)
CREATE POLICY "Delivery persons can view customer profiles" 
ON public.profiles FOR SELECT 
USING (
  -- Les utilisateurs peuvent voir leur propre profil
  (auth.uid() = id) OR
  -- Les livreurs peuvent voir les profils des clients pour la livraison
  (EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.buyer_id = profiles.id 
    AND EXISTS (
      SELECT 1 FROM public.profiles AS delivery_profile
      WHERE delivery_profile.id = auth.uid() 
      AND delivery_profile.role = 'delivery'
    )
  ))
);

-- Ajouter une politique pour permettre aux livreurs de voir les produits
CREATE POLICY "Delivery persons can view products for delivery" 
ON public.products FOR SELECT 
USING (
  -- Tout le monde peut voir les produits disponibles
  (is_available = true) OR
  -- Les vendeur(se)s peuvent voir leurs propres produits
  (auth.uid() = vendor_id) OR
  -- Les livreurs peuvent voir tous les produits (pour les informations de livraison)
  (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'delivery'
  ))
); 