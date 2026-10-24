-- Apply after controlled_payouts and the timestamp repair, before deploying the provider router.
BEGIN;
ALTER TABLE public.payout_settings ADD COLUMN IF NOT EXISTS fallback_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.payout_mode_events ADD COLUMN IF NOT EXISTS fallback_enabled boolean;
ALTER TABLE public.payout_batch_items ADD COLUMN IF NOT EXISTS collection_provider text;
ALTER TABLE public.payout_dispatches
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'pixpay' CHECK (provider IN ('pixpay','paydunya')),
  ADD COLUMN IF NOT EXISTS collection_provider text,
  ADD COLUMN IF NOT EXISTS provider_reference text,
  ADD COLUMN IF NOT EXISTS fallback_of uuid REFERENCES public.payout_dispatches(id);
CREATE UNIQUE INDEX IF NOT EXISTS payout_dispatch_one_fallback ON public.payout_dispatches(fallback_of) WHERE fallback_of IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payout_dispatch_reference ON public.payout_dispatches(provider,provider_reference) WHERE provider_reference IS NOT NULL;

-- Pause only on the first installation, not when this migration is replayed.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='payout_collection_provider') THEN
    UPDATE payout_settings SET mode='manual',fallback_enabled=false,updated_at=now() WHERE id=1;
    INSERT INTO payout_mode_events(mode,fallback_enabled) VALUES('manual',false);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.payout_collection_provider(p_order uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE WHEN count(*)=count(provider) AND count(DISTINCT provider)=1 THEN min(provider) END FROM (
    SELECT CASE WHEN lower(t.provider) IN ('pixpay','pixpay_wave') THEN 'pixpay'
      WHEN lower(t.provider) IN ('paydunya','paydunya_wave') THEN 'paydunya' END AS provider
    FROM payment_transactions t JOIN orders o ON o.id=t.order_id
    WHERE t.order_id=p_order AND upper(t.status) IN ('SUCCESSFUL','COMPLETED','SUCCESS')
      AND lower(coalesce(t.transaction_type,'payment')) NOT IN ('payout','vendor_payout','refund','withdrawal','admin_withdrawal')
      AND t.amount=o.total_amount
  ) collections;
$$;

CREATE OR REPLACE FUNCTION public.set_payout_fallback(p_enabled boolean,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  UPDATE payout_settings SET fallback_enabled=p_enabled,updated_by=p_actor,updated_at=now() WHERE id=1 RETURNING to_jsonb(payout_settings.*) INTO result;
  INSERT INTO payout_mode_events(mode,actor_id,fallback_enabled) SELECT mode,p_actor,p_enabled FROM payout_settings WHERE id=1;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.bind_payout_reference(p_attempt uuid,p_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d payout_dispatches%ROWTYPE;
BEGIN
  SELECT * INTO d FROM payout_dispatches WHERE id=p_attempt;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentative inconnue'; END IF;
  PERFORM 1 FROM payout_batches WHERE id=d.batch_id FOR UPDATE;
  SELECT * INTO d FROM payout_dispatches WHERE id=p_attempt FOR UPDATE;
  IF d.provider<>'paydunya' OR d.status NOT IN ('PROCESSING','UNKNOWN') OR p_reference IS NULL OR btrim(p_reference)='' THEN RAISE EXCEPTION 'Tentative non réservable'; END IF;
  IF d.provider_reference IS NOT NULL AND d.provider_reference<>p_reference THEN RAISE EXCEPTION 'Token déjà réservé'; END IF;
  UPDATE payout_dispatches SET provider_reference=p_reference,updated_at=now() WHERE id=p_attempt;
END $$;

CREATE OR REPLACE FUNCTION public.record_paydunya_collection(p_order uuid,p_token text,p_amount numeric,p_sandbox boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM orders WHERE id=p_order FOR UPDATE;
  IF NOT FOUND OR o.token IS DISTINCT FROM p_token OR o.total_amount IS DISTINCT FROM p_amount OR p_amount<=0 THEN RAISE EXCEPTION 'Encaissement incohérent'; END IF;
  IF EXISTS (SELECT 1 FROM payment_transactions WHERE transaction_id=p_token AND (order_id IS DISTINCT FROM p_order OR lower(provider) NOT IN ('paydunya','paydunya_wave','paydunya_sandbox'))) THEN RAISE EXCEPTION 'Token de paiement déjà utilisé'; END IF;
  INSERT INTO payment_transactions(transaction_id,provider,order_id,amount,status,transaction_type)
    VALUES(p_token,CASE WHEN p_sandbox THEN 'paydunya_sandbox' ELSE 'paydunya' END,p_order,p_amount,'SUCCESSFUL','payment')
    ON CONFLICT(transaction_id) DO UPDATE SET status='SUCCESSFUL',transaction_type='payment',provider=excluded.provider;
  UPDATE orders SET payment_confirmed_at=coalesce(payment_confirmed_at,now()),is_demo=coalesce(is_demo,false) OR p_sandbox WHERE id=p_order;
END $$;

-- Inspection, batch creation, atomic provider-specific reservation and settlement follow.
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
  IF payout_collection_provider(o.id) IS NULL THEN reasons:=array_append(reasons,'payment_provider_unknown_or_ambiguous'); END IF;
  RETURN jsonb_build_object('collection_provider',payout_collection_provider(o.id),'ok',true,'eligible',cardinality(reasons)=0,'order',to_jsonb(o),'vendor',jsonb_build_object('id',v.id,'phone',v.phone,'wallet_type',v.wallet_type),'reasons',reasons);
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
    INSERT INTO payout_batch_items(batch_id,order_id,vendor_id,amount,commission_pct,commission_amount,net_amount,status,collection_provider)
      VALUES(b.id,o.id,o.vendor_id,gross,p_pct,commission,gross-commission,'queued',payout_collection_provider(o.id));
    UPDATE orders SET payout_status='scheduled' WHERE id=o.id;
    UPDATE payout_batches SET total_amount=total_amount+gross WHERE id=b.id RETURNING * INTO b;
  END LOOP;
  RETURN CASE WHEN b.id IS NULL THEN NULL ELSE to_jsonb(b) END;
END $$;

CREATE OR REPLACE FUNCTION public.claim_payout_dispatch(p_batch uuid,p_vendor uuid,p_automatic boolean,p_order uuid,p_provider text,p_fallback_of uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b payout_batches%ROWTYPE; i payout_batch_items%ROWTYPE; v profiles%ROWTYPE; d payout_dispatches%ROWTYPE;
  ids uuid[] := '{}'; order_ids uuid[] := '{}'; net bigint:=0; report jsonb; chosen text; collected text; prior payout_dispatches%ROWTYPE;
BEGIN
  -- Serialize every dispatch of the same batch, including cancellation.
  SELECT * INTO b FROM payout_batches WHERE id=p_batch FOR UPDATE;
  IF NOT FOUND OR b.status IN ('cancelled','completed') THEN RETURN NULL; END IF;
  IF p_automatic THEN
    PERFORM 1 FROM payout_settings WHERE id=1 AND mode='automatic' FOR SHARE;
    IF NOT FOUND OR b.scheduled_at>now() OR (p_fallback_of IS NULL AND b.source<>'automatic') THEN RETURN NULL; END IF;
    IF p_fallback_of IS NOT NULL AND NOT EXISTS (SELECT 1 FROM payout_settings WHERE id=1 AND fallback_enabled) THEN RETURN NULL; END IF;
  END IF;
  IF p_fallback_of IS NOT NULL THEN
    SELECT * INTO prior FROM payout_dispatches WHERE id=p_fallback_of FOR UPDATE;
    IF NOT FOUND OR prior.batch_id<>p_batch OR prior.vendor_id<>p_vendor OR prior.status<>'FAILED' OR prior.fallback_of IS NOT NULL THEN RETURN NULL; END IF;
    IF EXISTS (SELECT 1 FROM payout_dispatches WHERE fallback_of=p_fallback_of) THEN RETURN NULL; END IF;
    IF p_provider IS DISTINCT FROM (CASE prior.provider WHEN 'pixpay' THEN 'paydunya' ELSE 'pixpay' END) THEN RAISE EXCEPTION 'Prestataire de secours invalide'; END IF;
  ELSIF p_provider IS NOT NULL AND p_provider NOT IN ('pixpay','paydunya') THEN RAISE EXCEPTION 'Prestataire inconnu'; END IF;
  SELECT * INTO v FROM profiles WHERE id=p_vendor FOR SHARE;
  IF v.phone IS NULL OR coalesce(v.wallet_type,'wave-senegal') NOT IN ('wave-senegal','orange-senegal') THEN RAISE EXCEPTION 'Coordonnées vendeur invalides'; END IF;
  FOR i IN SELECT * FROM payout_batch_items WHERE batch_id=p_batch AND vendor_id=p_vendor AND status IN ('queued','failed')
    AND (NOT p_automatic OR p_fallback_of IS NOT NULL OR status='queued')
    AND (p_fallback_of IS NULL OR id IN (SELECT item_id FROM payout_dispatch_items WHERE dispatch_id=p_fallback_of))
    AND (p_order IS NULL OR order_id=p_order) ORDER BY order_id FOR UPDATE
  LOOP
    PERFORM 1 FROM orders WHERE id=i.order_id FOR UPDATE;
    report:=inspect_payout_order(i.order_id);
    IF NOT (report->>'eligible')::boolean THEN CONTINUE; END IF;
    collected:=report->>'collection_provider';
    IF p_fallback_of IS NULL AND p_provider IS NOT NULL AND collected<>p_provider THEN CONTINUE; END IF;
    IF i.collection_provider IS NOT NULL AND i.collection_provider<>collected THEN RAISE EXCEPTION 'Prestataire d’encaissement modifié'; END IF;
    IF p_fallback_of IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM payout_dispatch_items di JOIN payout_dispatches pd ON pd.id=di.dispatch_id
        WHERE di.item_id=i.id AND pd.id<>prior.id AND pd.created_at>prior.created_at) THEN RETURN NULL; END IF;
    END IF;
    IF chosen IS NULL THEN chosen:=collected; END IF;
    IF collected<>chosen THEN CONTINUE; END IF;
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
  IF p_fallback_of IS NOT NULL AND net<>prior.amount THEN RETURN NULL; END IF;
  INSERT INTO payout_dispatches(batch_id,vendor_id,amount,phone,wallet_type,provider,collection_provider,fallback_of) VALUES(p_batch,p_vendor,net,v.phone,coalesce(v.wallet_type,'wave-senegal'),coalesce(p_provider,chosen),chosen,p_fallback_of) RETURNING * INTO d;
  INSERT INTO payout_dispatch_items(dispatch_id,item_id,order_id) SELECT d.id,id,order_id FROM payout_batch_items WHERE id=ANY(ids);
  UPDATE payout_batch_items SET status='processing',collection_provider=chosen WHERE id=ANY(ids);
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
  IF d.status IN ('SUCCESSFUL','FAILED') THEN RETURN to_jsonb(d)||jsonb_build_object('transitioned',false); END IF;
  next_state:=p_state;
  UPDATE payout_dispatches SET status=next_state,transaction_id=coalesce(p_transaction,transaction_id),response=p_response,updated_at=now() WHERE id=d.id RETURNING * INTO d;
  item_state:=CASE next_state WHEN 'SUCCESSFUL' THEN 'paid' WHEN 'FAILED' THEN 'failed' ELSE 'processing' END;
  UPDATE payout_batch_items SET status=item_state,provider_transaction_id=coalesce(d.transaction_id,provider_transaction_id),provider_response=p_response WHERE id IN (SELECT item_id FROM payout_dispatch_items WHERE dispatch_id=d.id);
  UPDATE orders SET payout_status=item_state,payout_paid_at=CASE WHEN next_state='SUCCESSFUL' THEN now() ELSE payout_paid_at END WHERE id IN (SELECT order_id FROM payout_dispatch_items WHERE dispatch_id=d.id);
  IF d.transaction_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM payment_transactions WHERE transaction_id=d.transaction_id AND (provider IS DISTINCT FROM d.provider OR batch_id IS DISTINCT FROM d.batch_id OR order_id IS NOT NULL)) THEN RAISE EXCEPTION 'Référence financière déjà utilisée'; END IF;
    INSERT INTO payment_transactions(transaction_id,provider,batch_id,amount,phone,status,transaction_type,raw_response)
      VALUES(d.transaction_id,d.provider,d.batch_id,d.amount,d.phone,CASE next_state WHEN 'PROCESSING' THEN 'PENDING1' ELSE next_state END,'payout',p_response)
    ON CONFLICT(transaction_id) DO UPDATE SET status=excluded.status,provider_response=excluded.raw_response,updated_at=now();
  END IF;
  UPDATE payout_batches SET status=CASE
    WHEN NOT EXISTS (SELECT 1 FROM payout_batch_items WHERE batch_id=d.batch_id AND status<>'paid') THEN 'completed'
    WHEN EXISTS (SELECT 1 FROM payout_batch_items WHERE batch_id=d.batch_id AND status='processing') THEN 'processing'
    WHEN EXISTS (SELECT 1 FROM payout_batch_items WHERE batch_id=d.batch_id AND status='failed') THEN 'failed'
    ELSE 'scheduled' END,
    processed_at=now() WHERE id=d.batch_id;
  RETURN to_jsonb(d)||jsonb_build_object('transitioned',true);
END $$;

CREATE OR REPLACE FUNCTION public.claim_payout_dispatch(p_batch uuid,p_vendor uuid,p_automatic boolean,p_order uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT claim_payout_dispatch(p_batch,p_vendor,p_automatic,p_order,NULL::text,NULL::uuid);
$$;
CREATE OR REPLACE FUNCTION public.claim_payout_fallback(p_attempt uuid,p_automatic boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d payout_dispatches%ROWTYPE;
BEGIN
  SELECT * INTO d FROM payout_dispatches WHERE id=p_attempt;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN claim_payout_dispatch(d.batch_id,d.vendor_id,p_automatic,NULL::uuid,CASE d.provider WHEN 'pixpay' THEN 'paydunya' ELSE 'pixpay' END,d.id);
END $$;
CREATE OR REPLACE FUNCTION public.list_payout_fallback_candidates()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(jsonb_agg(candidate),'[]'::jsonb) FROM (
    SELECT d.id FROM payout_dispatches d WHERE d.status='FAILED' AND d.fallback_of IS NULL
      AND NOT EXISTS (SELECT 1 FROM payout_dispatches other WHERE other.fallback_of=d.id)
      AND NOT EXISTS (SELECT 1 FROM payout_dispatch_items di JOIN payout_dispatch_items other ON other.item_id=di.item_id
        JOIN payout_dispatches newer ON newer.id=other.dispatch_id WHERE di.dispatch_id=d.id AND newer.created_at>d.created_at)
    ORDER BY d.created_at LIMIT 50
  ) candidate;
$$;
REVOKE ALL ON FUNCTION public.payout_collection_provider(uuid),public.set_payout_fallback(boolean,uuid),public.bind_payout_reference(uuid,text),public.record_paydunya_collection(uuid,text,numeric,boolean),public.claim_payout_dispatch(uuid,uuid,boolean,uuid,text,uuid),public.claim_payout_fallback(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.payout_collection_provider(uuid),public.set_payout_fallback(boolean,uuid),public.bind_payout_reference(uuid,text),public.record_paydunya_collection(uuid,text,numeric,boolean),public.claim_payout_dispatch(uuid,uuid,boolean,uuid,text,uuid),public.claim_payout_fallback(uuid,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.list_payout_fallback_candidates() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_payout_fallback_candidates() TO service_role;
COMMIT;
