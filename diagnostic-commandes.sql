-- Script de diagnostic complet pour les commandes et RLS
-- À exécuter dans l'interface SQL de Supabase

-- 1. Vérifier l'état actuel des politiques RLS
SELECT 
    schemaname,
    tablename, 
    policyname,
    permissive,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename IN ('orders', 'profiles', 'products')
ORDER BY tablename, policyname;

-- 2. Vérifier que RLS est activé sur les tables
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename IN ('orders', 'profiles', 'products')
AND schemaname = 'public';

-- 3. Compter toutes les commandes par statut
SELECT 
    status,
    COUNT(*) as nombre,
    COUNT(CASE WHEN delivery_person_id IS NULL THEN 1 END) as non_assignees
FROM public.orders 
GROUP BY status
ORDER BY status;

-- 4. Voir toutes les commandes avec leurs détails
SELECT 
    o.id,
    o.order_code,
    o.status,
    o.delivery_person_id,
    o.total_amount,
    o.delivery_address,
    o.buyer_phone,
    o.created_at,
    p.name as product_name,
    buyer.full_name as buyer_name,
    vendor.full_name as vendor_name,
    delivery.full_name as delivery_name
FROM public.orders o
LEFT JOIN public.products p ON o.product_id = p.id
LEFT JOIN public.profiles buyer ON o.buyer_id = buyer.id
LEFT JOIN public.profiles vendor ON o.vendor_id = vendor.id
LEFT JOIN public.profiles delivery ON o.delivery_person_id = delivery.id
ORDER BY o.created_at DESC
LIMIT 20;

-- 5. Vérifier les profils utilisateurs
SELECT 
    id,
    full_name,
    role,
    created_at
FROM public.profiles 
ORDER BY created_at DESC
LIMIT 10;

-- 6. Vérifier les produits
SELECT 
    id,
    name,
    code,
    price,
    vendor_id,
    is_available
FROM public.products 
ORDER BY created_at DESC
LIMIT 10;

-- 7. Test d'accès simulé pour un livreur
-- Remplace 'USER_ID_HERE' par l'ID d'un livreur réel
-- SELECT 
--     o.id,
--     o.order_code,
--     o.status,
--     o.delivery_person_id,
--     p.name as product_name,
--     buyer.full_name as buyer_name
-- FROM public.orders o
-- LEFT JOIN public.products p ON o.product_id = p.id
-- LEFT JOIN public.profiles buyer ON o.buyer_id = buyer.id
-- WHERE o.status = 'paid' 
-- AND o.delivery_person_id IS NULL
-- ORDER BY o.created_at DESC;

-- 8. Vérifier les contraintes de clés étrangères
SELECT 
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
AND tc.table_name IN ('orders', 'profiles', 'products')
ORDER BY tc.table_name, kcu.column_name; 