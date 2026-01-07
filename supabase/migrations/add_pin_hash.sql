-- Migration: Ajouter le support du code PIN pour l'authentification style Wave
-- Exécutez ce script dans l'éditeur SQL de Supabase

-- Ajouter la colonne pin_hash à la table profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS pin_hash TEXT;

-- Ajouter un commentaire pour expliquer l'usage
COMMENT ON COLUMN profiles.pin_hash IS 'Code PIN hashé pour authentification rapide style Wave';

-- Index pour les recherches par téléphone (si pas déjà existant)
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone);
