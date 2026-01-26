-- Migration: create admin_users table
-- Run this in Supabase SQL Editor or via psql
CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);
