-- Création de la table push_tokens pour Firebase Cloud Messaging
-- Date: 1er Février 2026

-- 1. Créer la table
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT CHECK (platform IN ('ios', 'android', 'web')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, platform)
);

-- 2. Créer les index pour performances
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_token ON push_tokens(token);

-- 3. Activer Row Level Security
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- 4. Politique: Les utilisateurs peuvent gérer leurs propres tokens
CREATE POLICY "Users can manage own tokens"
  ON push_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Politique: Le service backend (service_role) peut tout gérer
CREATE POLICY "Service role can manage all tokens"
  ON push_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6. Fonction de mise à jour automatique du timestamp
CREATE OR REPLACE FUNCTION update_push_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Trigger pour mettre à jour updated_at automatiquement
CREATE TRIGGER update_push_tokens_timestamp
  BEFORE UPDATE ON push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_push_tokens_updated_at();

-- 8. OPTIONNEL: Migrer les tokens existants depuis profiles.push_token
-- Décommenter si vous voulez migrer les données existantes
/*
INSERT INTO push_tokens (user_id, token, platform, created_at, updated_at)
SELECT 
  id as user_id,
  push_token as token,
  'android' as platform,  -- Ajuster selon vos besoins
  created_at,
  updated_at
FROM profiles
WHERE push_token IS NOT NULL 
  AND push_token != ''
ON CONFLICT (user_id, platform) DO NOTHING;
*/

-- 9. Vérification
SELECT 'Table push_tokens créée avec succès!' as message;
SELECT COUNT(*) as total_tokens FROM push_tokens;
