-- Migration: table de déduplication des messages WhatsApp entrants (bot Validèl)
-- À exécuter dans l'éditeur SQL Supabase (ou via psql).
--
-- Le bot WhatsApp (backend/whatsapp-bot.js) insère chaque msg_id reçu. La contrainte
-- de clé primaire garantit qu'un même message rejoué par D7/Meta n'est traité qu'une
-- seule fois (exactly-once), même en cas de redémarrage ou de plusieurs instances.
CREATE TABLE IF NOT EXISTS whatsapp_processed_messages (
  msg_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index pour la purge périodique (TTL 24 h).
CREATE INDEX IF NOT EXISTS idx_whatsapp_processed_created_at
  ON whatsapp_processed_messages (created_at);

-- Purge optionnelle (à planifier via pg_cron si disponible) :
-- DELETE FROM whatsapp_processed_messages WHERE created_at < now() - interval '24 hours';
