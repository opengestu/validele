-- Migration: Persistance des sessions OTP (provider Direct7 + fallback local)
-- Objectif: ne plus perdre les sessions OTP lors d'un redémarrage/scale du backend
-- (Render met le service en veille et peut tourner en plusieurs instances).
-- On réutilise la table otp_codes en ajoutant les colonnes nécessaires au flux provider.

-- Colonnes additionnelles pour le flux "verify provider" Direct7
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS mode TEXT;          -- 'd7' | 'local'
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS channel TEXT;       -- 'sms' | 'whatsapp'
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS otp_id TEXT;        -- identifiant OTP renvoyé par Direct7 (mode d7)
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ; -- pour le cooldown anti-renvoi

-- En mode 'd7' le code n'est pas stocké côté backend (c'est Direct7 qui vérifie),
-- donc la colonne code doit pouvoir être NULL.
ALTER TABLE otp_codes ALTER COLUMN code DROP NOT NULL;

-- Nettoyage: la table est un stockage temporaire, l'accès se fait via service_role_key (bypass RLS).
COMMENT ON COLUMN otp_codes.mode IS 'd7 = vérification déléguée à Direct7 (otp_id), local = code stocké et vérifié côté backend';
COMMENT ON COLUMN otp_codes.otp_id IS 'Identifiant OTP renvoyé par Direct7 (mode d7)';
COMMENT ON COLUMN otp_codes.last_sent_at IS 'Horodatage du dernier envoi (cooldown anti-renvoi)';
