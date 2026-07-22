-- Migration: texte SMS de secours par notification (mécanisme réutilisable)
-- À exécuter dans l'éditeur SQL Supabase (ou via psql).
--
-- La table whatsapp_delivery_read_tracking (migration 005) sert désormais à
-- plusieurs types de notifications acheteur "WhatsApp d'abord, SMS de secours si
-- non lu après 10 min" (livraison, remboursement…). Chaque ligne porte le texte
-- SMS exact à envoyer si le WhatsApp n'est pas lu, pour que le reconciler envoie
-- le bon message selon le type de notif (backend/whatsapp-bot.js).
ALTER TABLE whatsapp_delivery_read_tracking
  ADD COLUMN IF NOT EXISTS fallback_sms_text text;
