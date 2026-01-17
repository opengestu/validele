-- =====================================================
-- SCRIPT À EXÉCUTER IMMÉDIATEMENT DANS SUPABASE SQL EDITOR
-- Copier TOUT ce contenu et l'exécuter
-- =====================================================

-- 1. Supprimer TOUTES les anciennes politiques sur orders
DROP POLICY IF EXISTS "Delivery persons can update assigned orders" ON public.orders;
DROP POLICY IF EXISTS "Delivery persons can take orders" ON public.orders;
DROP POLICY IF EXISTS "Vendors and delivery persons can update orders" ON public.orders;
DROP POLICY IF EXISTS "Vendors and delivery can update orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view orders based on role" ON public.orders;
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Buyers can create orders" ON public.orders;
DROP POLICY IF EXISTS "Allow authenticated users to view orders" ON public.orders;

-- 2. Créer les nouvelles politiques PERMISSIVES

-- Politique de lecture: tout utilisateur authentifié peut voir les commandes liées à lui
CREATE POLICY "orders_select_policy" 
ON public.orders FOR SELECT 
USING (
  auth.uid() = buyer_id OR
  auth.uid() = vendor_id OR
  auth.uid() = delivery_person_id OR
  -- Les livreurs peuvent voir les commandes disponibles (payées, non assignées)
  (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'delivery')
    AND status = 'paid' 
    AND delivery_person_id IS NULL
  )
);

-- Politique d'insertion: les acheteurs peuvent créer des commandes
CREATE POLICY "orders_insert_policy" 
ON public.orders FOR INSERT 
WITH CHECK (auth.uid() = buyer_id);

-- Politique de mise à jour: vendeurs ET livreurs peuvent mettre à jour
CREATE POLICY "orders_update_policy" 
ON public.orders FOR UPDATE 
USING (
  -- Vendeurs: peuvent modifier leurs propres commandes
  auth.uid() = vendor_id
  OR
  -- Livreurs: peuvent prendre des commandes ou modifier celles qui leur sont assignées
  (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'delivery')
    AND (
      -- Peut prendre une commande disponible
      (delivery_person_id IS NULL AND status = 'paid')
      OR
      -- Peut modifier une commande qui lui est assignée
      (delivery_person_id = auth.uid())
    )
  )
)
WITH CHECK (
  -- Vendeurs
  auth.uid() = vendor_id
  OR
  -- Livreurs: peuvent s'assigner ou changer le statut de leurs commandes
  (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'delivery')
    AND delivery_person_id = auth.uid()
  )
);

-- 3. Vérifier que RLS est activé
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 4. Afficher les politiques créées pour vérification
SELECT 
  policyname,
  cmd,
  permissive
FROM pg_policies 
WHERE tablename = 'orders';

-- 5. Test: Afficher les dernières commandes pour vérifier
SELECT 
  id,
  order_code,
  status,
  delivery_person_id,
  delivered_at
FROM orders 
ORDER BY created_at DESC 
LIMIT 5;
