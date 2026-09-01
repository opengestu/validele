-- Migration : code public de boutique (profiles.shop_code) + lecture anonyme.
-- À exécuter dans l'éditeur SQL Supabase (ou via psql), APRÈS la 009.
--
-- Objectif : donner à chaque vendeur un identifiant PUBLIC court et partageable,
-- pour son lien de catalogue :
--   web       https://www.validel.shop/boutique/BQ12345
--   WhatsApp  https://wa.me/<bot>?text=Catalogue%20BQ12345
--
-- Pourquoi pas l'UUID du vendeur : il est long, illisible dans un message
-- WhatsApp, et il ne doit pas circuler en clair. Le format suit celui des codes
-- produit (PD1234) pour rester reconnaissable : BQ + 5 chiffres.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS shop_code text;

-- Index partiel : seuls les vendeurs ont un code, les NULL ne s'y trouvent pas.
-- C'est aussi lui qui garantit l'unicité (le lien de catalogue en dépend).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_shop_code_key
  ON public.profiles (shop_code)
  WHERE shop_code IS NOT NULL;

-- Génération d'un code libre. Boucle plutôt que « random + espoir » : 90 000
-- combinaisons, la collision devient probable bien avant d'être rare.
CREATE OR REPLACE FUNCTION public.generate_shop_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
BEGIN
  LOOP
    candidate := 'BQ' || ((floor(random() * 90000) + 10000)::int)::text;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE shop_code = candidate
    );
  END LOOP;
  RETURN candidate;
END;
$$;

-- Attribution automatique : tout profil vendeur créé (ou promu vendeur) repart
-- avec un code. Aucune ligne de code applicatif n'a donc à y penser.
CREATE OR REPLACE FUNCTION public.set_shop_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role = 'vendor' AND (NEW.shop_code IS NULL OR NEW.shop_code = '') THEN
    NEW.shop_code := public.generate_shop_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_shop_code ON public.profiles;
CREATE TRIGGER profiles_set_shop_code
  BEFORE INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_shop_code();

-- Rattrapage des vendeurs existants. Un UPDATE de masse ne convient PAS :
-- generate_shop_code() lirait le même snapshot pour toutes les lignes et
-- pourrait tirer deux fois le même code -> violation d'unicité. Une boucle
-- d'UPDATE unitaires donne à chaque appel un snapshot à jour.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM public.profiles
    WHERE role = 'vendor' AND (shop_code IS NULL OR shop_code = '')
  LOOP
    UPDATE public.profiles
      SET shop_code = public.generate_shop_code()
      WHERE id = r.id;
  END LOOP;
END $$;

-- Lecture anonyme : la page catalogue /boutique/{code} est publique, donc un
-- visiteur non connecté doit pouvoir résoudre shop_code -> boutique.
--
-- L'ancienne policy (migration 20260526) n'autorisait la lecture que pour un
-- vendeur ayant AU MOINS un produit disponible. Insuffisant ici : une boutique
-- momentanément vide doit afficher « aucun produit pour l'instant », pas
-- « boutique introuvable ». La condition devient donc simplement « c'est un
-- vendeur ». L'exposition reste limitée par les GRANT de colonnes ci-dessous :
-- id, company_name (= le nom d'enseigne, déjà public par nature) et shop_code.
-- Ni téléphone, ni adresse, ni nom personnel.
DROP POLICY IF EXISTS "Anon can read vendor company names for available products" ON public.profiles;
DROP POLICY IF EXISTS "Anon can read vendor shop profiles" ON public.profiles;

CREATE POLICY "Anon can read vendor shop profiles"
ON public.profiles
FOR SELECT
TO anon
USING (role = 'vendor');

-- Rappel : la 20260526 a fait REVOKE SELECT ON profiles FROM anon puis
-- GRANT SELECT (id, company_name). On ajoute shop_code — sans lui, impossible
-- même de FILTRER sur la colonne côté anon.
GRANT SELECT (id, company_name, shop_code) ON public.profiles TO anon;
