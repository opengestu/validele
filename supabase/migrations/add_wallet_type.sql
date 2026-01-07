-- Migration pour ajouter la colonne wallet_type à la table profiles
-- Cette colonne stocke le type de wallet utilisé pour les paiements (Wave, Orange Money, etc.)

-- Ajouter la colonne wallet_type si elle n'existe pas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'wallet_type'
    ) THEN
        ALTER TABLE profiles ADD COLUMN wallet_type TEXT;
    END IF;
END $$;

-- Ajouter un commentaire descriptif
COMMENT ON COLUMN profiles.wallet_type IS 'Type de wallet pour recevoir les paiements: wave-senegal, orange-money-senegal, etc.';
