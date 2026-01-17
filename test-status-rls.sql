-- Script de test pour vérifier que la politique RLS fonctionne correctement
-- À exécuter dans Supabase SQL Editor après avoir appliqué la migration

-- 1. Vérifier que la nouvelle politique existe
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'orders' 
  AND policyname = 'Delivery persons can update assigned orders';

-- 2. Tester la mise à jour du statut (simulation)
-- Remplacez {order_id} par un vrai ID de commande et {delivery_person_id} par le vrai ID du livreur

-- Test 1: Vérifier qu'on peut passer de 'paid' à 'in_delivery'
-- UPDATE orders 
-- SET status = 'in_delivery', delivery_person_id = '{delivery_person_id}'
-- WHERE id = '{order_id}' AND status = 'paid';

-- Test 2: Vérifier qu'on peut passer de 'in_delivery' à 'delivered'
-- UPDATE orders 
-- SET status = 'delivered', delivered_at = NOW()
-- WHERE id = '{order_id}' AND status = 'in_delivery' AND delivery_person_id = '{delivery_person_id}';

-- 3. Vérifier les commandes et leurs statuts
SELECT 
  id,
  order_code,
  status,
  delivery_person_id,
  delivered_at,
  created_at
FROM orders 
WHERE status IN ('paid', 'in_delivery', 'delivered')
ORDER BY created_at DESC
LIMIT 10;

-- 4. Vérifier les transactions de paiement associées
SELECT 
  pt.id,
  pt.order_id,
  pt.transaction_type,
  pt.status,
  pt.amount,
  o.status as order_status,
  o.order_code
FROM payment_transactions pt
INNER JOIN orders o ON o.id = pt.order_id
WHERE pt.transaction_type = 'payout'
ORDER BY pt.created_at DESC
LIMIT 10;
