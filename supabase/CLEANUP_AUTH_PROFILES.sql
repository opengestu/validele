-- Script SQL manuel pour nettoyer les incohérences auth/profil
-- À exécuter dans le SQL Editor de Supabase
-- Date: 2026-01-10

-- 1. Identifier les utilisateurs auth sans profil
SELECT 
  au.id,
  au.email,
  au.created_at,
  au.raw_user_meta_data->>'full_name' as full_name,
  au.raw_user_meta_data->>'phone' as phone,
  au.raw_user_meta_data->>'role' as role
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL
ORDER BY au.created_at DESC;

-- 2. Créer les profils manquants pour ces utilisateurs
INSERT INTO public.profiles (id, full_name, phone, role, created_at, updated_at)
SELECT 
  au.id,
  COALESCE(au.raw_user_meta_data->>'full_name', 'Utilisateur'),
  au.raw_user_meta_data->>'phone' as phone,
  COALESCE(au.raw_user_meta_data->>'role', 'buyer'),
  au.created_at,
  NOW()
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 3. Vérifier le résultat
SELECT 
  'Profils créés' as action,
  COUNT(*) as nombre
FROM public.profiles
WHERE created_at >= NOW() - INTERVAL '1 minute';

-- 4. Identifier les profils sans utilisateur auth (profils orphelins)
SELECT 
  p.id,
  p.full_name,
  p.phone,
  p.role,
  p.created_at
FROM public.profiles p
LEFT JOIN auth.users au ON au.id = p.id
WHERE au.id IS NULL
ORDER BY p.created_at DESC;

-- 5. Si vous voulez supprimer les profils orphelins (optionnel)
-- DELETE FROM public.profiles p
-- WHERE NOT EXISTS (
--   SELECT 1 FROM auth.users au WHERE au.id = p.id
-- );

-- 6. Vérifier que tout est cohérent maintenant
SELECT 
  (SELECT COUNT(*) FROM auth.users) as total_auth_users,
  (SELECT COUNT(*) FROM public.profiles) as total_profiles,
  (SELECT COUNT(*) FROM auth.users au LEFT JOIN public.profiles p ON p.id = au.id WHERE p.id IS NULL) as auth_sans_profil,
  (SELECT COUNT(*) FROM public.profiles p LEFT JOIN auth.users au ON au.id = p.id WHERE au.id IS NULL) as profil_sans_auth;
