-- Run before deploying the controlled payout backend. No historical status is rewritten.
BEGIN;

ALTER TABLE public.payout_batches ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
CREATE TABLE IF NOT EXISTS public.payout_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  mode text NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual','automatic')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.payout_settings(id) VALUES (1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.payout_mode_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mode text NOT NULL,
  actor_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.payout_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.payout_batches(id),
  vendor_id uuid NOT NULL REFERENCES public.profiles(id),
  amount bigint NOT NULL CHECK (amount > 0), phone text NOT NULL, wallet_type text NOT NULL,
  status text NOT NULL DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING','UNKNOWN','SUCCESSFUL','FAILED')),
  transaction_id text UNIQUE, response jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.payout_dispatch_items (
  dispatch_id uuid NOT NULL REFERENCES public.payout_dispatches(id),
  item_id uuid NOT NULL REFERENCES public.payout_batch_items(id),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  PRIMARY KEY(dispatch_id,item_id)
);
CREATE INDEX IF NOT EXISTS payout_dispatch_items_order ON public.payout_dispatch_items(order_id);
ALTER TABLE public.payout_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_mode_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_dispatch_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payout_settings, public.payout_mode_events, public.payout_dispatches, public.payout_dispatch_items FROM anon, authenticated;
GRANT ALL ON public.payout_settings, public.payout_mode_events, public.payout_dispatches, public.payout_dispatch_items TO service_role;

CREATE OR REPLACE FUNCTION public.set_payout_mode(p_mode text, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF p_mode NOT IN ('manual','automatic') THEN RAISE EXCEPTION 'Mode invalide'; END IF;
  UPDATE payout_settings SET mode=p_mode, updated_by=p_actor, updated_at=now() WHERE id=1 RETURNING to_jsonb(payout_settings.*) INTO result;
  INSERT INTO payout_mode_events(mode,actor_id) VALUES(p_mode,p_actor);
  RETURN result;
END $$;

-- Pure inspection: never changes an order, including when reconciliation is needed.
CREATE OR REPLACE FUNCTION public.inspect_payout_order(p_order uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o orders%ROWTYPE; v profiles%ROWTYPE; reasons text[] := '{}'; paid boolean;
BEGIN
  SELECT * INTO o FROM orders WHERE id=p_order;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'eligible',false,'reasons',ARRAY['order_not_found']); END IF;
  SELECT * INTO v FROM profiles WHERE id=o.vendor_id;
  paid := o.payment_confirmed_at IS NOT NULL OR EXISTS (
    SELECT 1 FROM payment_transactions t WHERE t.order_id=o.id AND upper(t.status)='SUCCESSFUL'
    AND lower(coalesce(t.transaction_type,'payment')) NOT IN ('payout','vendor_payout','refund','withdrawal','admin_withdrawal')
  );
  IF o.status <> 'delivered' OR o.status IS NULL THEN reasons:=array_append(reasons,'not_delivered'); END IF;
  IF NOT paid THEN reasons:=array_append(reasons,'payment_not_confirmed'); END IF;
  IF coalesce(o.is_demo,false) THEN reasons:=array_append(reasons,'demo_order'); END IF;
  IF o.payout_status IS NULL OR o.payout_status NOT IN ('requested','scheduled','failed') THEN reasons:=array_append(reasons,'invalid_payout_status'); END IF;
  IF v.phone IS NULL OR btrim(v.phone)='' OR coalesce(v.wallet_type,'wave-senegal') NOT IN ('wave-senegal','orange-senegal') THEN reasons:=array_append(reasons,'vendor_info_missing'); END IF;
  IF o.total_amount IS NULL OR o.total_amount - coalesce(o.protection_fee,0) <= 0 THEN reasons:=array_append(reasons,'invalid_amount'); END IF;
  IF EXISTS (SELECT 1 FROM refund_requests WHERE order_id=o.id AND status IN ('pending','approved','processed')) THEN reasons:=array_append(reasons,'refund_pending_or_processed'); END IF;
  IF EXISTS (
    SELECT 1 FROM payout_dispatch_items di JOIN payout_dispatches d ON d.id=di.dispatch_id
    WHERE di.order_id=o.id AND d.status<>'FAILED'
  ) OR EXISTS (
    SELECT 1 FROM payment_transactions t WHERE t.order_id=o.id AND lower(t.transaction_type) IN ('payout','vendor_payout')
    AND upper(coalesce(t.status,'UNKNOWN')) NOT IN ('FAILED','CANCELLED','CANCELED')
  ) OR EXISTS (
    SELECT 1 FROM payout_batch_items i WHERE i.order_id=o.id AND (
      i.status IN ('paid','processing') OR (i.provider_transaction_id IS NOT NULL AND i.status<>'failed')
    )
  ) OR EXISTS (
    -- Preserve historical sends even if their old item link was not recorded.
    SELECT 1 FROM payout_batch_items i JOIN payment_transactions t ON t.batch_id=i.batch_id
    WHERE i.order_id=o.id AND lower(t.transaction_type) IN ('payout','vendor_payout')
      AND upper(coalesce(t.status,'UNKNOWN')) NOT IN ('FAILED','CANCELLED','CANCELED')
      AND (t.phone=v.phone OR t.phone IS NULL OR i.provider_transaction_id=t.transaction_id)
      AND NOT EXISTS (SELECT 1 FROM payout_dispatches pd WHERE pd.transaction_id=t.transaction_id)
  ) THEN reasons:=array_append(reasons,'payout_already_sent_or_uncertain'); END IF;
  RETURN jsonb_build_object('ok',true,'eligible',cardinality(reasons)=0,'order',to_jsonb(o),'vendor',jsonb_build_object('id',v.id,'phone',v.phone,'wallet_type',v.wallet_type),'reasons',reasons);
END $$;

CREATE OR REPLACE FUNCTION public.create_controlled_payout_batch(p_order uuid, p_pct numeric, p_actor uuid, p_source text, p_notes text, p_scheduled_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o orders%ROWTYPE; b payout_batches%ROWTYPE; gross bigint; commission bigint; report jsonb;
BEGIN
  IF p_pct IS NULL OR p_pct<0 OR p_pct>=100 OR p_pct::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Commission invalide'; END IF;
  IF p_source NOT IN ('manual','automatic') OR p_source IS NULL THEN RAISE EXCEPTION 'Source invalide'; END IF;
  IF p_source='automatic' THEN
    PERFORM 1 FROM payout_settings WHERE id=1 AND mode='automatic' FOR SHARE;
    IF NOT FOUND THEN RETURN NULL; END IF;
  END IF;
  FOR o IN SELECT * FROM orders WHERE status='delivered' AND payout_status='requested'
    AND NOT coalesce(is_demo,false) AND (p_order IS NULL OR id=p_order)
    ORDER BY created_at LIMIT 500 FOR UPDATE SKIP LOCKED
  LOOP
    report:=inspect_payout_order(o.id);
    IF NOT (report->>'eligible')::boolean THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM payout_batch_items i JOIN payout_batches pb ON pb.id=i.batch_id WHERE i.order_id=o.id AND pb.status<>'cancelled' AND i.status IN ('queued','processing','paid','failed')) THEN CONTINUE; END IF;
    gross:=o.total_amount-coalesce(o.protection_fee,0);
    commission:=round(gross*p_pct/100);
    IF gross-commission<=0 THEN CONTINUE; END IF;
    IF b.id IS NULL THEN
      INSERT INTO payout_batches(created_by,scheduled_at,total_amount,notes,commission_pct,status,source)
        VALUES(p_actor,coalesce(p_scheduled_at,now()),0,p_notes,p_pct,'scheduled',p_source) RETURNING * INTO b;
    END IF;
    INSERT INTO payout_batch_items(batch_id,order_id,vendor_id,amount,commission_pct,commission_amount,net_amount,status)
      VALUES(b.id,o.id,o.vendor_id,gross,p_pct,commission,gross-commission,'queued');
    UPDATE orders SET payout_status='scheduled' WHERE id=o.id;
    UPDATE payout_batches SET total_amount=total_amount+gross WHERE id=b.id RETURNING * INTO b;
  END LOOP;
  RETURN CASE WHEN b.id IS NULL THEN NULL ELSE to_jsonb(b) END;
END $$;

CREATE OR REPLACE FUNCTION public.claim_payout_dispatch(p_batch uuid,p_vendor uuid,p_automatic boolean,p_order uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b payout_batches%ROWTYPE; i payout_batch_items%ROWTYPE; v profiles%ROWTYPE; d payout_dispatches%ROWTYPE;
  ids uuid[] := '{}'; order_ids uuid[] := '{}'; net bigint:=0; report jsonb;
BEGIN
  -- Serialize every dispatch of the same batch, including cancellation.
  SELECT * INTO b FROM payout_batches WHERE id=p_batch FOR UPDATE;
  IF NOT FOUND OR b.status IN ('cancelled','completed') THEN RETURN NULL; END IF;
  IF p_automatic THEN
    PERFORM 1 FROM payout_settings WHERE id=1 AND mode='automatic' FOR SHARE;
    IF NOT FOUND OR b.source<>'automatic' OR b.scheduled_at>now() THEN RETURN NULL; END IF;
  END IF;
  SELECT * INTO v FROM profiles WHERE id=p_vendor FOR SHARE;
  IF v.phone IS NULL OR coalesce(v.wallet_type,'wave-senegal') NOT IN ('wave-senegal','orange-senegal') THEN RAISE EXCEPTION 'Coordonnées vendeur invalides'; END IF;
  FOR i IN SELECT * FROM payout_batch_items WHERE batch_id=p_batch AND vendor_id=p_vendor AND status IN ('queued','failed')
    AND (NOT p_automatic OR status='queued')
    AND (p_order IS NULL OR order_id=p_order) ORDER BY order_id FOR UPDATE
  LOOP
    PERFORM 1 FROM orders WHERE id=i.order_id FOR UPDATE;
    report:=inspect_payout_order(i.order_id);
    IF NOT (report->>'eligible')::boolean THEN CONTINUE; END IF;
    -- Legacy failed items without a recorded dispatch require provider reconciliation.
    IF i.provider_transaction_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM payout_dispatch_items di JOIN payout_dispatches pd ON pd.id=di.dispatch_id
      WHERE di.item_id=i.id AND pd.status='FAILED'
    ) THEN CONTINUE; END IF;
    IF i.net_amount IS NULL OR i.net_amount<=0 OR i.net_amount<>trunc(i.net_amount)
      OR i.amount IS NULL OR i.commission_amount IS NULL OR i.commission_pct IS NULL
      OR i.net_amount<>i.amount-i.commission_amount OR i.commission_amount<>round(i.amount*i.commission_pct/100)
      OR i.commission_pct<0 OR i.commission_pct>=100
      OR i.amount<>(report->'order'->>'total_amount')::numeric-coalesce((report->'order'->>'protection_fee')::numeric,0)
    THEN RAISE EXCEPTION 'Montant net invalide, vérifier le batch'; END IF;
    ids:=array_append(ids,i.id); order_ids:=array_append(order_ids,i.order_id); net:=net+i.net_amount;
  END LOOP;
  IF cardinality(ids)=0 THEN RETURN NULL; END IF;
  INSERT INTO payout_dispatches(batch_id,vendor_id,amount,phone,wallet_type) VALUES(p_batch,p_vendor,net,v.phone,coalesce(v.wallet_type,'wave-senegal')) RETURNING * INTO d;
  INSERT INTO payout_dispatch_items(dispatch_id,item_id,order_id) SELECT d.id,id,order_id FROM payout_batch_items WHERE id=ANY(ids);
  UPDATE payout_batch_items SET status='processing' WHERE id=ANY(ids);
  UPDATE orders SET payout_status='processing',payout_processing_at=now() WHERE id=ANY(order_ids);
  UPDATE payout_batches SET status='processing' WHERE id=p_batch;
  RETURN to_jsonb(d);
END $$;

CREATE OR REPLACE FUNCTION public.settle_payout_dispatch(p_attempt uuid,p_transaction text,p_state text,p_response jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d payout_dispatches%ROWTYPE; next_state text; item_state text;
BEGIN
  -- Same lock order as claim/cancel, to avoid deadlocks during a fast IPN.
  SELECT * INTO d FROM payout_dispatches WHERE id=p_attempt;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentative inconnue'; END IF;
  PERFORM 1 FROM payout_batches WHERE id=d.batch_id FOR UPDATE;
  SELECT * INTO d FROM payout_dispatches WHERE id=p_attempt FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentative inconnue'; END IF;
  IF p_state NOT IN ('PROCESSING','UNKNOWN','SUCCESSFUL','FAILED') THEN RAISE EXCEPTION 'Statut invalide'; END IF;
  IF d.transaction_id IS NOT NULL AND p_transaction IS NOT NULL AND d.transaction_id<>p_transaction THEN RAISE EXCEPTION 'Transaction incohérente'; END IF;
  -- IPN may arrive before the HTTP response. A later acknowledgement never undoes it.
  IF d.status IN ('SUCCESSFUL','FAILED') THEN RETURN to_jsonb(d); END IF;
  next_state:=p_state;
  UPDATE payout_dispatches SET status=next_state,transaction_id=coalesce(p_transaction,transaction_id),response=p_response,updated_at=now() WHERE id=d.id RETURNING * INTO d;
  item_state:=CASE next_state WHEN 'SUCCESSFUL' THEN 'paid' WHEN 'FAILED' THEN 'failed' ELSE 'processing' END;
  UPDATE payout_batch_items SET status=item_state,provider_transaction_id=coalesce(d.transaction_id,provider_transaction_id),provider_response=p_response WHERE id IN (SELECT item_id FROM payout_dispatch_items WHERE dispatch_id=d.id);
  UPDATE orders SET payout_status=item_state,payout_paid_at=CASE WHEN next_state='SUCCESSFUL' THEN now() ELSE payout_paid_at END WHERE id IN (SELECT order_id FROM payout_dispatch_items WHERE dispatch_id=d.id);
  IF d.transaction_id IS NOT NULL THEN
    INSERT INTO payment_transactions(transaction_id,provider,batch_id,amount,phone,status,transaction_type,raw_response)
      VALUES(d.transaction_id,'pixpay',d.batch_id,d.amount,d.phone,CASE next_state WHEN 'PROCESSING' THEN 'PENDING1' ELSE next_state END,'payout',p_response)
    ON CONFLICT(transaction_id) DO UPDATE SET status=excluded.status,provider_response=excluded.raw_response,updated_at=now();
  END IF;
  UPDATE payout_batches SET status=CASE
    WHEN NOT EXISTS (SELECT 1 FROM payout_batch_items WHERE batch_id=d.batch_id AND status<>'paid') THEN 'completed'
    WHEN EXISTS (SELECT 1 FROM payout_batch_items WHERE batch_id=d.batch_id AND status='processing') THEN 'processing'
    WHEN EXISTS (SELECT 1 FROM payout_batch_items WHERE batch_id=d.batch_id AND status='failed') THEN 'failed'
    ELSE 'scheduled' END,
    processed_at=now() WHERE id=d.batch_id;
  RETURN to_jsonb(d);
END $$;

CREATE OR REPLACE FUNCTION public.cancel_controlled_payout_batch(p_batch uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b payout_batches%ROWTYPE;
BEGIN
  SELECT * INTO b FROM payout_batches WHERE id=p_batch FOR UPDATE;
  IF NOT FOUND OR b.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Batch non annulable'; END IF;
  IF EXISTS (SELECT 1 FROM payout_dispatches WHERE batch_id=p_batch AND status<>'FAILED')
    OR EXISTS (SELECT 1 FROM payout_batch_items WHERE batch_id=p_batch AND (status IN ('processing','paid') OR provider_transaction_id IS NOT NULL)) THEN RAISE EXCEPTION 'Virement envoyé ou incertain : annulation impossible'; END IF;
  UPDATE orders SET payout_status='requested' WHERE id IN (SELECT order_id FROM payout_batch_items WHERE batch_id=p_batch) AND payout_status IN ('scheduled','failed');
  UPDATE payout_batch_items SET status='failed',provider_response='{"reason":"batch_cancelled"}'::jsonb WHERE batch_id=p_batch;
  UPDATE payout_batches SET status='cancelled',processed_at=now() WHERE id=p_batch;
  RETURN jsonb_build_object('success',true);
END $$;

-- Replace the old trigger: only payouts, only items belonging to THIS transaction.
CREATE OR REPLACE FUNCTION public.payment_transactions_sync_orders_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.status='SUCCESSFUL' AND OLD.status IS DISTINCT FROM NEW.status
    AND lower(NEW.transaction_type) IN ('payout','vendor_payout') THEN
    IF NEW.order_id IS NOT NULL THEN
      UPDATE orders SET payout_status='paid',payout_paid_at=now() WHERE id=NEW.order_id;
    END IF;
    IF NEW.batch_id IS NOT NULL THEN
      UPDATE payout_batch_items SET status='paid' WHERE batch_id=NEW.batch_id AND provider_transaction_id=NEW.transaction_id;
      UPDATE orders SET payout_status='paid',payout_paid_at=now() WHERE id IN (
        SELECT order_id FROM payout_batch_items WHERE batch_id=NEW.batch_id AND provider_transaction_id=NEW.transaction_id
      );
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS payment_transactions_sync_orders_trg ON public.payment_transactions;
CREATE TRIGGER payment_transactions_sync_orders_trg AFTER UPDATE ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION public.payment_transactions_sync_orders_fn();

REVOKE ALL ON FUNCTION public.set_payout_mode(text,uuid), public.inspect_payout_order(uuid), public.create_controlled_payout_batch(uuid,numeric,uuid,text,text,timestamptz), public.claim_payout_dispatch(uuid,uuid,boolean,uuid), public.settle_payout_dispatch(uuid,text,text,jsonb), public.cancel_controlled_payout_batch(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_payout_mode(text,uuid), public.inspect_payout_order(uuid), public.create_controlled_payout_batch(uuid,numeric,uuid,text,text,timestamptz), public.claim_payout_dispatch(uuid,uuid,boolean,uuid), public.settle_payout_dispatch(uuid,text,text,jsonb), public.cancel_controlled_payout_batch(uuid) TO service_role;
COMMIT;
