-- Migration: Créer la table refund_requests pour gérer les demandes de remboursement

-- Table pour stocker les demandes de remboursement
CREATE TABLE IF NOT EXISTS refund_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'processed')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES profiles(id),
  processed_at TIMESTAMP WITH TIME ZONE,
  transaction_id TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_refund_requests_order_id ON refund_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_buyer_id ON refund_requests(buyer_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status);
CREATE INDEX IF NOT EXISTS idx_refund_requests_requested_at ON refund_requests(requested_at DESC);

-- Trigger pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_refund_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_refund_requests_updated_at
  BEFORE UPDATE ON refund_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_refund_requests_updated_at();

-- Politique RLS (Row Level Security)
ALTER TABLE refund_requests ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs peuvent voir leurs propres demandes
CREATE POLICY "Users can view their own refund requests"
  ON refund_requests
  FOR SELECT
  USING (auth.uid() = buyer_id);

-- Les utilisateurs peuvent créer leurs propres demandes
CREATE POLICY "Users can create refund requests"
  ON refund_requests
  FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);

-- Seuls les admins peuvent mettre à jour les demandes (approuver/rejeter)
CREATE POLICY "Only admins can update refund requests"
  ON refund_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Les admins peuvent voir toutes les demandes
CREATE POLICY "Admins can view all refund requests"
  ON refund_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Commentaires pour documentation
COMMENT ON TABLE refund_requests IS 'Table pour gérer les demandes de remboursement des clients';
COMMENT ON COLUMN refund_requests.status IS 'Statut de la demande: pending (en attente), approved (approuvé), rejected (rejeté), processed (traité/remboursé)';
COMMENT ON COLUMN refund_requests.reviewed_by IS 'ID de l''admin qui a examiné la demande';
COMMENT ON COLUMN refund_requests.transaction_id IS 'ID de la transaction de remboursement PixPay';
