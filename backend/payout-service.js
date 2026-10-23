const crypto = require('node:crypto');

function commissionConfig(env = process.env) {
  const raw = env.PAYOUT_COMMISSION_PCT;
  const pct = Number(raw);
  const configured = raw !== undefined && String(raw).trim() !== '' && Number.isFinite(pct) && pct >= 0 && pct < 100;
  return { commission_pct: configured ? pct : null, commission_configured: configured };
}

function payoutAmounts(amount, fee, pct) {
  const gross = Number(amount) - Number(fee ?? 0);
  if (!Number.isSafeInteger(gross) || gross <= 0 || !Number.isFinite(pct) || pct < 0 || pct >= 100) throw new Error('Montant ou commission invalide');
  const commission = Math.round(gross * pct / 100);
  if (gross - commission <= 0) throw new Error('Le montant net doit être positif');
  return { amount: gross, commission_pct: pct, commission_amount: commission, net_amount: gross - commission };
}

function validWebhookToken(received, expected) {
  if (!expected || typeof received !== 'string') return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createPayoutService({ db, sendMoney, onPaid = async () => {}, env = process.env, logger = console }) {
  async function rpc(name, args = {}) {
    if (!db) throw new Error('Client Supabase service_role requis pour les payouts');
    const { data, error } = await db.rpc(name, args);
    if (error) throw new Error(error.message || 'Erreur de base de données payout');
    return data;
  }
  async function settings() {
    if (!db) throw new Error('Client Supabase service_role requis pour les payouts');
    const { data, error } = await db.from('payout_settings').select('*').eq('id', 1).single();
    if (error || !data) throw new Error('Configuration payout indisponible : appliquer la migration payout');
    return { ...data, ...commissionConfig(env), webhook_configured: !!env.PAYOUT_WEBHOOK_SECRET };
  }
  async function setMode(mode, actorId) {
    if (!['manual', 'automatic'].includes(mode)) throw new Error('Mode invalide');
    if (mode === 'automatic') {
      const config = await settings();
      if (!config.commission_configured || !config.webhook_configured) throw new Error('Configurer PAYOUT_COMMISSION_PCT et PAYOUT_WEBHOOK_SECRET sur Render avant activation');
    }
    return rpc('set_payout_mode', { p_mode: mode, p_actor: actorId });
  }
  async function createBatch({ orderId = null, pct, actorId = null, source = 'manual', notes = null, scheduledAt = null } = {}) {
    if (!env.PAYOUT_WEBHOOK_SECRET) throw new Error('PAYOUT_WEBHOOK_SECRET doit être configuré sur Render');
    const rate = pct === undefined ? commissionConfig(env).commission_pct : Number(pct);
    if (rate === null || !Number.isFinite(rate) || rate < 0 || rate >= 100) throw new Error('Commission requise, comprise entre 0 et moins de 100 %');
    return rpc('create_controlled_payout_batch', { p_order: orderId, p_pct: rate, p_actor: actorId, p_source: source, p_notes: notes, p_scheduled_at: scheduledAt });
  }
  async function verifyOrder(orderId) {
    const report = await rpc('inspect_payout_order', { p_order: orderId });
    const { data: items, error } = await db.from('payout_batch_items').select('amount,commission_pct,commission_amount,net_amount,batch:payout_batches!inner(status)').eq('order_id', orderId).neq('batch.status', 'cancelled').in('status', ['queued', 'failed']).order('created_at', { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    const rate = commissionConfig(env).commission_pct;
    report.amounts = items?.[0] || (rate !== null && report.order ? payoutAmounts(report.order.total_amount, report.order.protection_fee, rate) : null);
    return report;
  }
  async function settle(attemptId, transactionId, state, response) {
    return rpc('settle_payout_dispatch', { p_attempt: attemptId, p_transaction: transactionId || null, p_state: state, p_response: response || {} });
  }
  async function handleWebhook(body, token, customData) {
    if (!validWebhookToken(token, env.PAYOUT_WEBHOOK_SECRET)) throw new Error('Authentification IPN payout invalide');
    const { data: dispatch, error } = customData.payout_attempt_id
      ? await db.from('payout_dispatches').select('*').eq('id', customData.payout_attempt_id).maybeSingle()
      : await db.from('payout_dispatches').select('*').eq('transaction_id', body.transaction_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!dispatch) throw new Error('Virement historique à rapprocher avant migration');
    if (body.amount != null && Number(body.amount) !== Number(dispatch.amount)) throw new Error('Montant IPN incohérent');
    const state = String(body.state).toUpperCase();
    if (!['SUCCESSFUL', 'FAILED', 'PENDING', 'PENDING1', 'PENDING2', 'PROCESSING'].includes(state)) throw new Error('Statut IPN inconnu');
    const settled = await settle(dispatch.id, body.transaction_id, ['SUCCESSFUL', 'FAILED'].includes(state) ? state : 'PROCESSING', {
      state, response: body.response ?? null, error: body.error ?? null, received_at: new Date().toISOString()
    });
    if (dispatch.status !== 'SUCCESSFUL' && settled.status === 'SUCCESSFUL') {
      try { await onPaid(settled); }
      catch (error) { logger.error('[PAYOUT] Notification:', error.message); }
    }
    return settled;
  }
  async function processBatch(batchId, automatic = false, onlyOrder = null) {
    if (!env.PAYOUT_WEBHOOK_SECRET) throw new Error('PAYOUT_WEBHOOK_SECRET doit être configuré sur Render');
    const { data: items, error } = await db.from('payout_batch_items').select('vendor_id').eq('batch_id', batchId).in('status', ['queued', 'failed']);
    if (error) throw new Error(error.message);
    const results = [];
    for (const vendorId of new Set((items || []).map(item => item.vendor_id))) {
      // This RPC reserves orders and writes the dispatch BEFORE contacting Pixpay.
      const dispatch = await rpc('claim_payout_dispatch', { p_batch: batchId, p_vendor: vendorId, p_automatic: automatic, p_order: onlyOrder });
      if (!dispatch) continue;
      let result;
      try {
        result = await sendMoney({ amount: dispatch.amount, phone: dispatch.phone, walletType: dispatch.wallet_type, orderId: batchId, type: 'vendor_payout', payoutAttemptId: dispatch.id });
      } catch (error) {
        result = { success: false, uncertain: true, message: error.message };
      }
      const transactionId = result?.transaction_id || null;
      // A timeout or malformed response is UNKNOWN, never an automatic retry.
      const state = transactionId && result.success ? 'PROCESSING'
        : result && !result.success && result.uncertain === false ? 'FAILED' : 'UNKNOWN';
      try {
        await settle(dispatch.id, transactionId, state, { message: result?.message || null, state: result?.state || null });
      } catch (error) {
        // The pre-existing dispatch remains locked if recording the response fails.
        logger.error('[PAYOUT] Résultat à rapprocher, tentative conservée:', dispatch.id, error.message);
        throw new Error('Virement envoyé ou incertain ; suivi à vérifier. Ne pas relancer.');
      }
      results.push({ vendorId, attempt_id: dispatch.id, transaction_id: transactionId, state, amount: dispatch.amount, success: state === 'PROCESSING' });
    }
    return { success: true, results, message: results.length ? 'Traitement enregistré' : 'Aucun élément disponible (déjà traité, réservé ou automatisme désactivé)' };
  }
  async function payOrder(orderId, pct, actorId) {
    const report = await verifyOrder(orderId);
    if (!report.eligible) throw new Error(`Commande non éligible : ${(report.reasons || []).join(', ')}`);
    // Reuse a scheduled/failed item, retaining its ORIGINAL commission.
    const { data: existing, error } = await db.from('payout_batch_items').select('batch_id,status,batch:payout_batches!inner(status)').eq('order_id', orderId).neq('batch.status', 'cancelled').in('status', ['queued', 'failed']).order('created_at', { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    const batch = existing?.[0] ? { id: existing[0].batch_id } : await createBatch({ orderId, pct, actorId });
    if (!batch) throw new Error('Commande déjà réservée ou non éligible');
    return processBatch(batch.id, false, orderId);
  }
  let ticking = false;
  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      const config = await settings();
      if (config.mode !== 'automatic' || !config.commission_configured || !config.webhook_configured) return;
      await createBatch({ source: 'automatic' });
      // Resume only queued items after restart; processing/unknown/failed items are never retried.
      const { data, error } = await db.from('payout_batches').select('id,queued:payout_batch_items!inner(id)').eq('queued.status', 'queued').in('status', ['scheduled', 'processing', 'failed']).eq('source', 'automatic').lte('scheduled_at', new Date().toISOString()).order('created_at').limit(100);
      if (error) throw new Error(error.message);
      for (const batch of data || []) await processBatch(batch.id, true);
    } finally { ticking = false; }
  }
  async function attempts() {
    const { data, error } = await db.from('payout_dispatches').select('id,batch_id,amount,status,transaction_id,created_at,updated_at').order('created_at', { ascending: false }).limit(20);
    if (error) throw new Error(error.message);
    return data;
  }
  return { settings, setMode, createBatch, verifyOrder, processBatch, payOrder, tick, settle, handleWebhook, attempts, cancelBatch: batchId => rpc('cancel_controlled_payout_batch', { p_batch: batchId }) };
}

module.exports = { createPayoutService, commissionConfig, payoutAmounts, validWebhookToken };
