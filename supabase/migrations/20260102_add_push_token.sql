-- Ajouter la colonne push_token à la table profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Index pour rechercher rapidement par token (utile pour les notifications)
CREATE INDEX IF NOT EXISTS idx_profiles_push_token ON profiles(push_token) WHERE push_token IS NOT NULL;

-- Commentaire pour documentation
COMMENT ON COLUMN profiles.push_token IS 'Token FCM pour les notifications push';
