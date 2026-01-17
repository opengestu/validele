-- =====================================================
-- DIAGNOSTIC COMPLET - EXÉCUTER LIGNE PAR LIGNE
-- =====================================================

-- 1. VÉRIFIER LA STRUCTURE DE LA TABLE ORDERS
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns 
WHERE table_name = 'orders'
ORDER BY ordinal_position;

-- 2. VÉRIFIER TOUTES LES CONTRAINTES
SELECT 
  conname AS constraint_name,
  contype AS type,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint 
WHERE conrelid = 'public.orders'::regclass;

-- 3. VÉRIFIER TOUS LES TRIGGERS
SELECT 
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'orders';

-- 4. VÉRIFIER TOUTES LES POLITIQUES RLS
SELECT 
  policyname,
  cmd,
  permissive,
  qual::text AS using_clause,
  with_check::text AS with_check_clause
FROM pg_policies 
WHERE tablename = 'orders';

-- 5. VÉRIFIER SI RLS EST ACTIVÉ
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname = 'orders';

-- 6. VÉRIFIER LA COMMANDE SPÉCIFIQUE
SELECT * FROM orders WHERE id = '8401316c-18c7-4c0e-8d56-e5907ab201d4';

-- 7. VÉRIFIER LE PROFIL DU LIVREUR
SELECT id, role, full_name FROM profiles WHERE id = 'ae165abd-2520-4885-953e-5bf9b19da3d0';

-- 8. TEST: Désactiver RLS et faire l'update
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;

UPDATE orders 
SET status = 'delivered', delivered_at = NOW()
WHERE id = '8401316c-18c7-4c0e-8d56-e5907ab201d4';

-- Vérifier
SELECT id, status, delivered_at FROM orders WHERE id = '8401316c-18c7-4c0e-8d56-e5907ab201d4';

-- Réactiver RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- 9. Si l'update a fonctionné, le problème est RLS
-- Si l'update n'a PAS fonctionné, le problème est une contrainte ou un trigger

-- 10. RECHERCHER DES FONCTIONS QUI MODIFIENT LE STATUS
SELECT 
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND pg_get_functiondef(p.oid) ILIKE '%orders%'
AND pg_get_functiondef(p.oid) ILIKE '%status%';

-- 11. VÉRIFIER LES LOGS D'ERREUR RÉCENTS (si pgaudit activé)
-- SELECT * FROM pg_stat_activity WHERE state = 'active';
