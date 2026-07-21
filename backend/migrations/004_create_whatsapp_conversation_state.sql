-- Migration: mémoire de conversation du bot WhatsApp (produit "actif" par numéro)
-- À exécuter dans l'éditeur SQL Supabase (ou via psql).
--
-- Permet au bot de répondre à une question libre sur un produit sans que le
-- client ait à redonner le code (backend/whatsapp-bot.js). Sert aussi de
-- compteur pour le garde-fou anti-abus des réponses IA (fenêtre glissante 24h).
CREATE TABLE IF NOT EXISTS whatsapp_conversation_state (
  phone text PRIMARY KEY,
  product_code text,
  ai_question_count integer NOT NULL DEFAULT 0,
  ai_window_started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversation_state_updated_at
  ON whatsapp_conversation_state (updated_at);
