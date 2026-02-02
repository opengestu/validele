-- Script pour donner le rôle admin à un utilisateur
-- Remplacez 'VOTRE_EMAIL' par votre email admin

-- 1. Mettre à jour le rôle dans la table profiles
UPDATE profiles 
SET role = 'admin'
WHERE email = 'ndjibril997@gmail.com';  -- Remplacez par votre email

-- 2. (Optionnel) Créer une entrée dans admin_users si la table existe
-- INSERT INTO admin_users (id) 
-- SELECT id FROM profiles WHERE email = 'ndjibril997@gmail.com'
-- ON CONFLICT (id) DO NOTHING;

-- 3. Vérifier que le rôle a été mis à jour
SELECT id, email, full_name, role, created_at
FROM profiles 
WHERE email = 'ndjibril997@gmail.com';
