-- =====================================================
-- SOLUTION COMPLÈTE - EXÉCUTER DANS SUPABASE SQL EDITOR
-- PROBLÈME: La contrainte CHECK n'autorise pas 'in_delivery'
-- Le code utilise 'in_delivery' mais la DB n'autorise que 'in_transit'
-- =====================================================

-- ÉTAPE 1: Voir la contrainte actuelle
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint 
WHERE conrelid = 'public.orders'::regclass 
AND contype = 'c';

-- ÉTAPE 2: Supprimer l'ancienne contrainte CHECK sur status
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- ÉTAPE 3: Ajouter une nouvelle contrainte CHECK qui inclut 'in_delivery'
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
CHECK (status IN ('pending', 'paid', 'assigned', 'in_delivery', 'in_transit', 'delivered', 'cancelled'));

-- ÉTAPE 4: Vérifier que la contrainte est mise à jour
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint 
WHERE conrelid = 'public.orders'::regclass 
AND contype = 'c';

-- ÉTAPE 5: Supprimer TOUTES les politiques UPDATE existantes
DROP POLICY IF EXISTS "orders_update_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_update_permissive" ON public.orders;
DROP POLICY IF EXISTS "allow_order_updates" ON public.orders;
DROP POLICY IF EXISTS "Delivery persons can update assigned orders" ON public.orders;
DROP POLICY IF EXISTS "Vendors and delivery persons can update orders" ON public.orders;
DROP POLICY IF EXISTS "Vendors and delivery can update orders" ON public.orders;
DROP POLICY IF EXISTS "Delivery persons can take orders" ON public.orders;

-- ÉTAPE 6: Créer UNE SEULE politique UPDATE simple
CREATE POLICY "orders_update_simple" 
ON public.orders 
FOR UPDATE 
USING (
  auth.uid() = vendor_id 
  OR auth.uid() = buyer_id
  OR auth.uid() = delivery_person_id
  OR (
    -- Livreurs peuvent voir les commandes payées disponibles
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'delivery')
    AND delivery_person_id IS NULL 
    AND status = 'paid'
  )
)
WITH CHECK (
  auth.uid() = vendor_id 
  OR auth.uid() = buyer_id
  OR auth.uid() = delivery_person_id
);

-- ÉTAPE 7: Vérifier les politiques
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'orders';

-- ÉTAPE 8: Vérifier l'état actuel de la commande de test
SELECT id, order_code, status, delivery_person_id, delivered_at 
FROM orders 
WHERE id = '8401316c-18c7-4c0e-8d56-e5907ab201d4';

-- ÉTAPE 9: Mettre la commande en 'in_delivery' pour tester
UPDATE orders 
SET status = 'in_delivery'
WHERE id = '8401316c-18c7-4c0e-8d56-e5907ab201d4';

-- Vérifier
SELECT '=== APRÈS UPDATE in_delivery ===' as step;
SELECT id, order_code, status 
FROM orders 
WHERE id = '8401316c-18c7-4c0e-8d56-e5907ab201d4';

-- ÉTAPE 10: Tester le passage à 'delivered'
UPDATE orders 
SET status = 'delivered', delivered_at = NOW()
WHERE id = '8401316c-18c7-4c0e-8d56-e5907ab201d4';

-- Vérifier
SELECT '=== APRÈS UPDATE delivered ===' as step;
SELECT id, order_code, status, delivered_at 
FROM orders 
WHERE id = '8401316c-18c7-4c0e-8d56-e5907ab201d4';

-- ÉTAPE 11: Remettre en état de test (in_delivery) pour tester l'app
UPDATE orders 
SET status = 'in_delivery', delivered_at = NULL
WHERE id = '8401316c-18c7-4c0e-8d56-e5907ab201d4';

SELECT '=== PRÊT POUR TEST APP ===' as step;
SELECT id, order_code, status, delivery_person_id, delivered_at 
FROM orders 
WHERE id = '8401316c-18c7-4c0e-8d56-e5907ab201d4';

SELECT 'Script terminé avec succès! Retestez l''application.' AS message;
