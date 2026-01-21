-- Create table for payment transactions
-- Run this in your Supabase SQL editor or psql

create table if not exists payment_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_id text,
  provider text,
  provider_transaction_id text,
  order_id uuid,
  amount integer,
  phone text,
  status text,
  transaction_type text,
  provider_response jsonb,
  raw_response jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Index for fast lookup by transaction_id
create unique index if not exists idx_payment_transactions_transaction_id on payment_transactions (transaction_id);
create index if not exists idx_payment_transactions_order_id on payment_transactions (order_id);