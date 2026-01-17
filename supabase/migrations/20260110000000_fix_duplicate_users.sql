-- Migration pour corriger les problèmes de doublons d'utilisateurs
-- Date: 2026-01-10

-- 1. Ajouter une contrainte unique sur le téléphone dans profiles (si pas déjà existante)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_phone_key' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_key UNIQUE (phone);
    RAISE NOTICE 'Contrainte unique ajoutée sur profiles.phone';
  ELSE
    RAISE NOTICE 'Contrainte unique sur profiles.phone existe déjà';
  END IF;
END $$;

-- 2. Modifier le trigger handle_new_user pour mieux gérer les conflits
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_phone TEXT;
BEGIN
  -- Extraire phone des metadata
  user_phone := (new.raw_user_meta_data->>'phone');

  -- Essayer d'insérer ou mettre à jour le profil
  INSERT INTO public.profiles (id, full_name, phone, role, company_name, vehicle_info)
  VALUES (
    new.id,
    (new.raw_user_meta_data->>'full_name'),
    user_phone,
    COALESCE(new.raw_user_meta_data->>'role', 'buyer'),
    (new.raw_user_meta_data->>'company_name'),
    (new.raw_user_meta_data->>'vehicle_info')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    phone = COALESCE(EXCLUDED.phone, profiles.phone),
    role = COALESCE(EXCLUDED.role, profiles.role),
    company_name = COALESCE(EXCLUDED.company_name, profiles.company_name),
    vehicle_info = COALESCE(EXCLUDED.vehicle_info, profiles.vehicle_info),
    updated_at = NOW();

  RETURN new;
EXCEPTION 
  WHEN unique_violation THEN
    -- Si violation de contrainte unique (email ou phone déjà existant)
    -- On log l'erreur mais on ne bloque pas la création du user auth
    RAISE WARNING 'Profile creation failed for user % due to unique violation: %', new.id, SQLERRM;
    RETURN new;
  WHEN OTHERS THEN
    -- Pour toute autre erreur, on log mais on ne bloque pas
    RAISE WARNING 'handle_new_user trigger error for user %: %', new.id, SQLERRM;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Créer une fonction pour nettoyer les utilisateurs auth sans profil
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_auth_users()
RETURNS TABLE(deleted_user_id UUID, deleted_email TEXT) AS $$
BEGIN
  RETURN QUERY
  WITH orphaned_users AS (
    SELECT au.id, au.email
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE p.id IS NULL
    AND au.created_at < NOW() - INTERVAL '1 hour' -- Seulement les vieux orphelins
  )
  SELECT ou.id, ou.email FROM orphaned_users ou;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Ajouter un commentaire sur la table profiles pour documentation
COMMENT ON TABLE public.profiles IS 'Profils utilisateurs avec contrainte unique sur phone pour éviter les doublons';
COMMENT ON COLUMN public.profiles.phone IS 'Numéro de téléphone unique de l''utilisateur (format: +221XXXXXXXXX)';
