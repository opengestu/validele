-- 2026-01-30: Fix orders RLS policies

-- 1. Supprimez toutes les politiques SELECT problématiques
DROP POLICY IF EXISTS "Delivery can read orders" ON orders;
DROP POLICY IF EXISTS "Delivery can view only assigned order by code" ON orders;
DROP POLICY IF EXISTS "Only assigned delivery can view order" ON orders;
DROP POLICY IF EXISTS "orders_select_policy" ON orders;

-- 2. Créez une politique SELECT claire et cohérente
CREATE POLICY "orders_select_policy" ON orders
FOR SELECT USING (
  -- 1. L'acheteur voit TOUTES ses commandes (tous statuts)
  (auth.uid() = buyer_id)
  
  -- 2. Le vendeur voit TOUTES ses commandes (tous statuts)
  OR (auth.uid() = vendor_id)
  
  -- 3. Le livreur assigné voit SES commandes (tous statuts sauf cancelled)
  OR (
    auth.uid() = delivery_person_id 
    AND status != 'cancelled'
  )
  
  -- 4. Les livreurs non-assignés voient les commandes disponibles
  OR (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'delivery'
    )
    AND delivery_person_id IS NULL
    AND status IN ('paid', 'in_delivery')  -- Commandes disponibles
  )
  
  -- 5. Les admins voient TOUT
  OR (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  )
);

-- 3. Simplifiez aussi la politique UPDATE
DROP POLICY IF EXISTS "Delivery can assign and update own orders" ON orders;
DROP POLICY IF EXISTS "orders_update_simple" ON orders;

CREATE POLICY "orders_update_policy" ON orders
FOR UPDATE USING (
  -- Le vendeur peut mettre à jour ses commandes
  (auth.uid() = vendor_id)
  
  -- Le livreur assigné peut mettre à jour ses commandes
  OR (auth.uid() = delivery_person_id)
  
  -- Les livreurs peuvent s'assigner des commandes disponibles
  OR (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'delivery'
    )
    AND delivery_person_id IS NULL
    AND status IN ('paid', 'in_delivery')
  )
  
  -- Les admins peuvent tout mettre à jour
  OR (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  )
);