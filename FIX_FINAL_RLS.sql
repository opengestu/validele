-- =====================================================
-- SOLUTION DÉFINITIVE - EXÉCUTER DANS SUPABASE SQL EDITOR
-- Ce script résout le problème de mise à jour du status
-- =====================================================

-- ÉTAPE 1: Vérifier l'état actuel
SELECT '=== ÉTAT ACTUEL ===' as step;
SELECT id, order_code, status, delivery_person_id, delivered_at 
FROM orders 
WHERE id = '8401316c-18c7-4c0e-8d56-e5907ab201d4';

-- ÉTAPE 2: Désactiver RLS temporairement pour tester
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;

-- ÉTAPE 3: Mettre à jour le status directement
UPDATE orders 
SET status = 'delivered'
WHERE id = '8401316c-18c7-4c0e-8d56-e5907ab201d4';

-- Vérifier
SELECT '=== APRÈS UPDATE SANS RLS ===' as step;
SELECT id, order_code, status, delivered_at 
FROM orders 
WHERE id = '8401316c-18c7-4c0e-8d56-e5907ab201d4';

-- ÉTAPE 4: Réactiver RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- ÉTAPE 5: Supprimer TOUTES les politiques UPDATE existantes
DROP POLICY IF EXISTS "orders_update_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_update_permissive" ON public.orders;
DROP POLICY IF EXISTS "Delivery persons can update assigned orders" ON public.orders;
DROP POLICY IF EXISTS "Vendors and delivery persons can update orders" ON public.orders;
DROP POLICY IF EXISTS "Vendors and delivery can update orders" ON public.orders;
DROP POLICY IF EXISTS "Delivery persons can take orders" ON public.orders;

-- ÉTAPE 6: Créer UNE SEULE politique UPDATE simple et permissive
CREATE POLICY "allow_order_updates" 
ON public.orders 
FOR UPDATE 
USING (true)  -- Permet de lire n'importe quelle ligne pour UPDATE
WITH CHECK (
  -- L'utilisateur doit être soit le vendeur(se), soit le livreur assigné, soit l'acheteur
  auth.uid() = vendor_id 
  OR auth.uid() = delivery_person_id
  OR auth.uid() = buyer_id
);

-- ÉTAPE 7: Vérifier les politiques finales
SELECT '=== POLITIQUES FINALES ===' as step;
SELECT policyname, cmd, permissive 
FROM pg_policies 
WHERE tablename = 'orders';

-- ÉTAPE 8: Test - Remettre en in_delivery pour retester
UPDATE orders 
SET status = 'in_delivery', delivered_at = NULL
WHERE id = '8401316c-18c7-4c0e-8d56-e5907ab201d4';

SELECT '=== PRÊT POUR RETEST ===' as step;
SELECT id, order_code, status, delivery_person_id, delivered_at 
FROM orders 
WHERE id = '8401316c-18c7-4c0e-8d56-e5907ab201d4';

SELECT 'Retestez maintenant la confirmation de livraison dans l''application.' AS instruction;
