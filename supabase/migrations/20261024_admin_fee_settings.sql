BEGIN;
ALTER TABLE public.payout_settings
  ADD COLUMN IF NOT EXISTS commission_pct numeric CHECK (commission_pct >= 0 AND commission_pct < 100),
  ADD COLUMN IF NOT EXISTS protection_fee_pct numeric CHECK (protection_fee_pct >= 0 AND protection_fee_pct <= 100);
CREATE TABLE IF NOT EXISTS public.fee_settings_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL,
  previous_values jsonb NOT NULL, new_values jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fee_settings_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fee_settings_events FROM anon, authenticated;
GRANT ALL ON public.fee_settings_events TO service_role;
CREATE OR REPLACE FUNCTION public.set_admin_fee_settings(p_commission numeric, p_protection numeric, p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE previous jsonb;
BEGIN
  IF p_actor IS NULL OR p_commission IS NULL OR p_protection IS NULL
    OR NOT (p_commission >= 0 AND p_commission < 100)
    OR NOT (p_protection >= 0 AND p_protection <= 100) THEN
    RAISE EXCEPTION 'Taux invalides';
  END IF;
  SELECT to_jsonb(s) INTO STRICT previous FROM payout_settings s WHERE id=1 FOR UPDATE;
  UPDATE payout_settings SET commission_pct=p_commission, protection_fee_pct=p_protection WHERE id=1;
  INSERT INTO fee_settings_events(actor_id,previous_values,new_values)
    VALUES(p_actor,previous,jsonb_build_object('commission_pct',p_commission,'protection_fee_pct',p_protection));
END $$;
REVOKE ALL ON FUNCTION public.set_admin_fee_settings(numeric,numeric,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_fee_settings(numeric,numeric,uuid) TO service_role;
COMMIT;
