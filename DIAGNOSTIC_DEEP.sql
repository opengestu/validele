-- =====================================================
-- DIAGNOSTIC APPROFONDI - EXÉCUTER DANS SUPABASE SQL EDITOR
-- =====================================================

-- 1. Vérifier s'il y a des TRIGGERS sur la table orders
SELECT 
  tgname AS trigger_name,
  tgtype,
  tgenabled,
  pg_get_triggerdef(oid) AS trigger_definition
FROM pg_trigger 
WHERE tgrelid = 'public.orders'::regclass;

-- 2. Vérifier s'il y a des contraintes CHECK sur le status
SELECT 
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint 
WHERE conrelid = 'public.orders'::regclass;

-- 3. Vérifier la structure de la colonne status
SELECT 
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'orders' AND column_name = 'status';

-- 4. Vérifier les valeurs autorisées pour status (si ENUM ou CHECK)
SELECT 
  t.typname AS enum_name,
  e.enumlabel AS enum_value
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname LIKE '%status%' OR t.typname LIKE '%order%';

-- 5. TEST DIRECT: Forcer la mise à jour du status
-- Remplacez l'ID par celui de votre commande
UPDATE orders 
SET status = 'delivered'
WHERE id = '8401316c-18c7-4c0e-8d56-e5907ab201d4';

-- 6. Vérifier le résultat
SELECT id, order_code, status, delivered_at 
FROM orders 
WHERE id = '8401316c-18c7-4c0e-8d56-e5907ab201d4';

-- 7. Si le test direct fonctionne, vérifier les politiques RLS en détail
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual::text AS using_clause,
  with_check::text AS with_check_clause
FROM pg_policies 
WHERE tablename = 'orders';

-- 8. Vérifier s'il y a des fonctions/triggers qui modifient automatiquement le status
SELECT 
  routine_name,
  routine_definition
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND (routine_definition ILIKE '%orders%' AND routine_definition ILIKE '%status%');
