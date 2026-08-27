-- Migration : numéro du bot WhatsApp à l'origine de la commande.
-- À exécuter dans l'éditeur SQL Supabase (ou via psql), comme la 007.
--
-- Le webhook D7 entrant porte le numéro business qui a REÇU le message (champ
-- `recipient`, cf. routage multi-numéro prod/démo dans backend/whatsapp-bot.js).
-- Ce numéro ne vivait que le temps du webhook : les notifications ultérieures
-- (livraison, remboursement, paiement confirmé) repartaient donc TOUJOURS du
-- numéro par défaut WHATSAPP_BOT_NUMBER, dans une autre conversation que celle
-- où l'acheteur a commandé. On le fige ici sur la commande.
--
-- Format : chiffres seuls, sans « + » (ex. '221768171175', '15554677146').
-- NULL = commande créée hors bot (web/app) ou avant cette migration -> les
-- notifications retombent sur WHATSAPP_BOT_NUMBER, comportement historique.
--
-- Sert aussi de base au « test mode » : une commande née du numéro démo est
-- identifiable sans colonne supplémentaire.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS bot_number text;
