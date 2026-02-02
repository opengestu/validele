-- Create admin_transfers table for tracking admin withdrawals from Pixpay
CREATE TABLE IF NOT EXISTS admin_transfers (
  id TEXT PRIMARY KEY,
  amount INTEGER NOT NULL,
  phone TEXT NOT NULL,
  wallet_type TEXT NOT NULL CHECK (wallet_type IN ('wave-senegal', 'orange-senegal')),
  note TEXT,
  status TEXT DEFAULT 'processing',
  provider_transaction_id TEXT,
  provider_response JSONB,
  created_by TEXT REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_admin_transfers_created_at ON admin_transfers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_transfers_status ON admin_transfers(status);

-- Enable RLS
ALTER TABLE admin_transfers ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can read/write (using service role bypasses RLS anyway)
-- For now, allow service role full access (no restrictive policies needed for admin-only table)

COMMENT ON TABLE admin_transfers IS 'Tracks admin withdrawals from Pixpay to external wallets (Wave/Orange Money)';
