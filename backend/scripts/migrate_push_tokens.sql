-- Migration des tokens push existants depuis profiles vers push_tokens
-- Date: 1er Février 2026
-- À exécuter APRÈS avoir créé la table push_tokens

-- Vérifier les données existantes dans profiles
SELECT 
  id,
  full_name,
  role,
  phone,
  push_token,
  CASE 
    WHEN push_token IS NOT NULL AND push_token != '' THEN 'OUI'
    ELSE 'NON'
  END as has_token
FROM profiles
WHERE push_token IS NOT NULL AND push_token != ''
ORDER BY updated_at DESC;

-- Compter les tokens à migrer
SELECT 
  COUNT(*) as tokens_to_migrate,
  COUNT(DISTINCT id) as unique_users
FROM profiles
WHERE push_token IS NOT NULL AND push_token != '';

-- Migration des tokens (exécuter ceci pour migrer)
INSERT INTO push_tokens (user_id, token, platform, created_at, updated_at)
SELECT 
  id as user_id,
  push_token as token,
  CASE 
    WHEN push_token LIKE '%APA91b%' THEN 'android'  -- Token FCM Android typique
    WHEN push_token LIKE '%:iOS:%' THEN 'ios'
    ELSE 'android'  -- Par défaut
  END as platform,
  created_at,
  updated_at
FROM profiles
WHERE push_token IS NOT NULL 
  AND push_token != ''
ON CONFLICT (user_id, platform) 
DO UPDATE SET 
  token = EXCLUDED.token,
  updated_at = EXCLUDED.updated_at;

-- Vérifier la migration
SELECT 
  pt.id,
  p.full_name,
  p.phone,
  pt.platform,
  LEFT(pt.token, 50) || '...' as token_preview,
  pt.created_at
FROM push_tokens pt
JOIN profiles p ON p.id = pt.user_id
ORDER BY pt.created_at DESC;

-- Statistiques après migration
SELECT 
  platform,
  COUNT(*) as count
FROM push_tokens
GROUP BY platform;
