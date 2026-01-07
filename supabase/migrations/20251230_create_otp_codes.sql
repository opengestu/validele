-- Table pour stocker les codes OTP (Direct7Networks)
-- Exécuter dans Supabase SQL Editor

CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour recherche rapide par numéro de téléphone
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone ON otp_codes(phone);

-- Index pour nettoyer les OTP expirés
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires ON otp_codes(expires_at);

-- RLS désactivé car accès uniquement via service_role_key du backend
ALTER TABLE otp_codes DISABLE ROW LEVEL SECURITY;

-- Fonction pour nettoyer automatiquement les OTP expirés (optionnel)
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS void AS $$
BEGIN
  DELETE FROM otp_codes WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Commentaire
COMMENT ON TABLE otp_codes IS 'Stockage temporaire des codes OTP pour authentification SMS via Direct7Networks';
