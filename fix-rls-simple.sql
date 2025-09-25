-- Version simplifiée des règles RLS pour résoudre le problème immédiatement
-- À exécuter dans l'interface SQL de Supabase

-- 1. Supprimer toutes les politiques existantes pour repartir de zéro
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view orders based on role" ON public.orders;
DROP POLICY IF EXISTS "Buyers can create orders" ON public.orders;
DROP POLICY IF EXISTS "Vendors and delivery persons can update orders" ON public.orders;
DROP POLICY IF EXISTS "Delivery persons can take orders" ON public.orders;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Delivery persons can view customer profiles" ON public.profiles;

DROP POLICY IF EXISTS "Anyone can view available products" ON public.products;
DROP POLICY IF EXISTS "Vendors can manage their products" ON public.products;
DROP POLICY IF EXISTS "Delivery persons can view products for delivery" ON public.products;

-- 2. Créer des politiques simples et permissives pour les tests
-- Politique pour orders - permettre à tous les utilisateurs authentifiés de voir les commandes
CREATE POLICY "Allow authenticated users to view orders" 
ON public.orders FOR SELECT 
USING (auth.role() = 'authenticated');

-- Politique pour orders - permettre aux acheteurs de créer des commandes
CREATE POLICY "Buyers can create orders" 
ON public.orders FOR INSERT 
WITH CHECK (auth.uid() = buyer_id);

-- Politique pour orders - permettre aux vendeurs et livreurs de modifier
CREATE POLICY "Vendors and delivery can update orders" 
ON public.orders FOR UPDATE 
USING (
  auth.uid() = vendor_id OR 
  auth.uid() = delivery_person_id OR
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'delivery'
  )
);

-- Politique pour profiles - permettre à tous les utilisateurs authentifiés de voir les profils
CREATE POLICY "Allow authenticated users to view profiles" 
ON public.profiles FOR SELECT 
USING (auth.role() = 'authenticated');

-- Politique pour profiles - permettre aux utilisateurs de modifier leur propre profil
CREATE POLICY "Users can update own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id);

-- Politique pour profiles - permettre l'insertion de profils
CREATE POLICY "Users can insert own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Politique pour products - permettre à tous de voir les produits disponibles
CREATE POLICY "Anyone can view available products" 
ON public.products FOR SELECT 
USING (is_available = true);

-- Politique pour products - permettre aux vendeurs de gérer leurs produits
CREATE POLICY "Vendors can manage their products" 
ON public.products FOR ALL 
USING (auth.uid() = vendor_id);

-- 3. Vérifier que les politiques ont été créées
SELECT 
    schemaname,
    tablename, 
    policyname,
    permissive,
    cmd
FROM pg_policies 
WHERE tablename IN ('orders', 'profiles', 'products')
ORDER BY tablename, policyname;

-- 4. Test simple - voir toutes les commandes
SELECT 
    COUNT(*) as total_orders,
    COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_orders,
    COUNT(CASE WHEN delivery_person_id IS NULL THEN 1 END) as unassigned_orders
FROM public.orders; 