-- Migration SQL: create sms_logs table
-- Run this on your Postgres database (Supabase SQL Editor or migration tool)

CREATE TABLE IF NOT EXISTS sms_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NULL,
  "to" text NOT NULL,
  text text NOT NULL,
  provider_response jsonb NULL,
  status text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sms_logs_order_id ON sms_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_to ON sms_logs("to");
