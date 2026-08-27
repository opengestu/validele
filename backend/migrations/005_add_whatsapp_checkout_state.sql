-- Migration : parcours de commande conversationnel du bot WhatsApp.
-- À exécuter dans l'éditeur SQL Supabase (ou via psql), comme la 004.
--
-- Stocke l'étape en cours et les données déjà collectées (nom, adresse, wallet)
-- pendant qu'un acheteur commande directement dans le chat, sans formulaire web.
-- Colonne JSONB volontairement : les champs du parcours évolueront (zone, quantité,
-- instructions livreur…) sans imposer une migration à chaque ajout.
--
-- Forme attendue :
--   {"step":"name|address|wallet|creating","code":"PD3431","startedAt":1756300000000,
--    "buyerName":"Awa Diop","address":"Sacré-Cœur 3, villa 45","walletKey":"w"}
ALTER TABLE whatsapp_conversation_state
  ADD COLUMN IF NOT EXISTS checkout jsonb;

