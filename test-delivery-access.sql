-- Script de test pour vérifier l'accès des livreurs
-- À exécuter dans l'interface SQL de Supabase

-- 1. Vérifier les politiques existantes
SELECT 
    schemaname,
    tablename, 
    policyname,
    permissive,
    cmd,
    qual
FROM pg_policies 
WHERE tablename IN ('orders', 'profiles', 'products')
ORDER BY tablename, policyname;

-- 2. Vérifier qu'il y a des commandes avec le statut 'paid'
SELECT 
    COUNT(*) as total_orders,
    COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_orders,
    COUNT(CASE WHEN status = 'in_delivery' THEN 1 END) as in_delivery_orders,
    COUNT(CASE WHEN delivery_person_id IS NULL THEN 1 END) as unassigned_orders
FROM public.orders;

-- 3. Vérifier les profils de livreurs
SELECT 
    id,
    full_name,
    role,
    created_at
FROM public.profiles 
WHERE role = 'delivery'
ORDER BY created_at DESC;

-- 4. Vérifier les commandes disponibles pour la livraison
SELECT 
    o.id,
    o.order_code,
    o.status,
    o.delivery_person_id,
    o.total_amount,
    o.delivery_address,
    o.buyer_phone,
    p.name as product_name,
    buyer.full_name as buyer_name
FROM public.orders o
LEFT JOIN public.products p ON o.product_id = p.id
LEFT JOIN public.profiles buyer ON o.buyer_id = buyer.id
WHERE o.status = 'paid' 
AND o.delivery_person_id IS NULL
ORDER BY o.created_at DESC
LIMIT 10;

-- 5. Vérifier les relations entre les tables
SELECT 
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