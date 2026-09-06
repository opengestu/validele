-- Migration: suivi de remise des notifications WhatsApp "en cours de livraison"
-- À exécuter dans l'éditeur SQL Supabase (ou via psql).
--
-- Permet un vrai fallback SMS (jamais WhatsApp + SMS en même temps) : on envoie
-- WhatsApp, on enregistre le request_id renvoyé par D7, puis :
--  - si D7 confirme "delivered" ou "read" -> read_at rempli (nom historique),
--  - un reconciler périodique (backend/whatsapp-bot.js) envoie le SMS de secours
--    uniquement si non remis après 10 minutes, et marque sms_sent pour ne jamais relancer.
CREATE TABLE IF NOT EXISTS whatsapp_delivery_read_tracking (
  request_id text PRIMARY KEY,
  order_id uuid NOT NULL,
  buyer_phone text NOT NULL,
  read_at timestamptz,
  sms_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index pour la requête du reconciler (messages non lus, SMS pas encore envoyé).
CREATE INDEX IF NOT EXISTS idx_whatsapp_delivery_read_tracking_pending
  ON whatsapp_delivery_read_tracking (created_at)
  WHERE read_at IS NULL AND sms_sent = false;
