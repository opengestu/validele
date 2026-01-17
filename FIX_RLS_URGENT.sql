-- =====================================================
-- TEST CRITIQUE - EXÉCUTER DANS SUPABASE SQL EDITOR
-- Ce script va nous dire exactement quel est le problème
-- =====================================================

-- 1. D'abord, testons si on peut modifier le status SANS RLS (en tant que superuser)
-- Ce test doit fonctionner car vous êtes admin dans SQL Editor
UPDATE orders 
SET status = 'delivered'
WHERE id = '8401316c-18c7-4c0e-8d56-e5907ab201d4';

-- Vérifier le résultat
SELECT id, order_code, status, delivery_person_id, delivered_at 
FROM orders 
WHERE id = '8401316c-18c7-4c0e-8d56-e5907ab201d4';

-- 2. Si ça fonctionne ci-dessus, le problème est RLS
-- Regardons les politiques actuelles en détail
SELECT 
  policyname,
  cmd,
  permissive,
  qual::text AS using_condition,
  with_check::text AS check_condition
FROM pg_policies 
WHERE tablename = 'orders' AND cmd = 'UPDATE';

-- 3. Vérifier s'il y a des triggers
SELECT 
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'orders';

-- 4. Vérifier le rôle du livreur
SELECT id, role, full_name 
FROM profiles 
WHERE id = 'ae165abd-2520-4885-953e-5bf9b19da3d0';

-- 5. SOLUTION: Supprimer toutes les politiques UPDATE et créer une plus permissive
DROP POLICY IF EXISTS "orders_update_policy" ON public.orders;
DROP POLICY IF EXISTS "Delivery persons can update assigned orders" ON public.orders;
DROP POLICY IF EXISTS "Vendors and delivery persons can update orders" ON public.orders;
DROP POLICY IF EXISTS "Vendors and delivery can update orders" ON public.orders;

-- Créer une politique UPDATE très permissive pour débugger
CREATE POLICY "orders_update_permissive" 
ON public.orders FOR UPDATE 
USING (
  auth.uid() = vendor_id 
  OR auth.uid() = delivery_person_id 
  OR auth.uid() = buyer_id
  OR delivery_person_id IS NULL
)
WITH CHECK (
  auth.uid() = vendor_id 
  OR auth.uid() = delivery_person_id
  OR auth.uid() = buyer_id
);

-- 6. Vérifier que la politique est créée
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'orders';

-- 7. Remettre la commande en état de test
UPDATE orders 
SET status = 'in_delivery'
WHERE id = '8401316c-18c7-4c0e-8d56-e5907ab201d4';

SELECT 'Script terminé. Retestez maintenant la confirmation de livraison dans l''app.' AS message;
