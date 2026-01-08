-- ⚠️ IMPORTANT : Exécutez ce SQL dans votre Dashboard Supabase
-- SQL Editor → New Query → Collez ce code → Run

-- Supprimer TOUTES les anciennes politiques de lecture sur profiles
DROP POLICY IF EXISTS "Delivery persons can view customer profiles" ON public.profiles;
DROP POLICY IF EXISTS "Delivery persons can view customer and vendor profiles" ON public.profiles;
DROP POLICY IF EXISTS "Delivery persons can view related profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Créer UNE SEULE politique simple : tous les utilisateurs authentifiés peuvent LIRE les profils
-- (Ils ne peuvent toujours PAS les modifier - seule la lecture est autorisée)
CREATE POLICY "Authenticated users can view all profiles" 
ON public.profiles FOR SELECT 
USING (auth.role() = 'authenticated');

-- Les politiques UPDATE et INSERT restent restrictives (un utilisateur ne peut modifier que son propre profil)
-- Elles existent déjà, on ne les touche pas

-- Vérifier les politiques
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies 
WHERE tablename = 'profiles'
ORDER BY cmd, policyname;
