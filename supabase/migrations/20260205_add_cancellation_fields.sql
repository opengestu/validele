-- Migration: Add cancellation fields to orders table
-- Generated: 2026-02-05

-- Add cancellation fields if they don't exist
ALTER TABLE IF EXISTS orders
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Create index for cancelled orders
CREATE INDEX IF NOT EXISTS idx_orders_cancelled_at ON orders(cancelled_at DESC);

-- Comment for documentation
COMMENT ON COLUMN orders.cancelled_at IS 'Date/heure d''annulation de la commande';
COMMENT ON COLUMN orders.cancellation_reason IS 'Raison de l''annulation (e.g., "Remboursement approuvé")';
