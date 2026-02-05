-- Migration: Permettre l'insertion dans profiles pendant la création d'utilisateur SMS
-- Nécessaire car l'endpoint /api/sms/register doit insérer des profils sans authentification préalable

-- Activer RLS sur profiles si ce n'est pas déjà fait
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Supprimer les anciennes politiques si elles existent
DROP POLICY IF EXISTS "Allow SMS registration insert" ON profiles;
DROP POLICY IF EXISTS "Allow user read own profile" ON profiles;
DROP POLICY IF EXISTS "Allow user update own profile" ON profiles;

-- Permettre l'insertion publique (pour la création de profil SMS)
CREATE POLICY "Allow SMS registration insert" ON profiles
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Permettre la lecture de son propre profil
CREATE POLICY "Allow user read own profile" ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Permettre la mise à jour de son propre profil
CREATE POLICY "Allow user update own profile" ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Note: La politique "Allow SMS registration insert" est très permissive mais:
-- 1. Elle ne s'applique qu'à l'insertion
-- 2. Le backend contrôle les champs (no injection)
-- 3. Le backend vérifie les doublons avant insertion
-- 4. Le backend utilise normalement la service_role_key qui bypass le RLS
-- 5. Cette politique n'existe que comme fallback si service_role_key n'est pas dispo
