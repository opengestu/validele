const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPayoutService, commissionConfig, payoutAmounts, validWebhookToken } = require('../payout-service');

test('commission vendeur explicite et frais acheteur exclus', () => {
  assert.equal(commissionConfig({}).commission_configured, false);
  assert.equal(commissionConfig({ PAYOUT_COMMISSION_PCT: '' }).commission_configured, false);
  assert.equal(commissionConfig({ PAYOUT_COMMISSION_PCT: '0' }).commission_pct, 0);
  for (const rate of ['NaN', 'Infinity', '-1', '100', '101']) assert.equal(commissionConfig({ PAYOUT_COMMISSION_PCT: rate }).commission_configured, false);
  assert.deepEqual(payoutAmounts(10300, 300, 2), { amount: 10000, commission_pct: 2, commission_amount: 200, net_amount: 9800 });
  assert.throws(() => payoutAmounts(1, 0, 99));
});
test('IPN sans secret ou avec mauvais secret refusé', () => {
  assert.equal(validWebhookToken(undefined, 'secret'), false);
  assert.equal(validWebhookToken('secret', ''), false);
  assert.equal(validWebhookToken('wrong', 'secret'), false);
  assert.equal(validWebhookToken('secret', 'secret'), true);
});

function fixture(response, failSettle = false) {
  const calls = [];
  const db = {
    from() { return { select() { return this; }, eq() { return this; }, in() { return Promise.resolve({ data: [{ vendor_id: 'vendor' }] }); } }; },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'claim_payout_dispatch' && args.p_provider) return { data: null };
      if (name === 'claim_payout_dispatch') return { data: { provider: 'pixpay', id: 'attempt', amount: 9800, phone: 'test', wallet_type: 'wave-senegal' } };
      if (failSettle) return { error: { message: 'DB unavailable' } };
      return { data: {} };
    }
  };
  const service = createPayoutService({ db, env: { PAYOUT_WEBHOOK_SECRET: 'secret' }, sendMoney: async params => { calls.push({ name: 'sendMoney', params }); if (response instanceof Error) throw response; return response; }, logger: { error() {} } });
  return { service, calls };
}
test('réservation durable avant envoi et identifiant de tentative transmis', async () => {
  const { service, calls } = fixture({ success: true, transaction_id: 'tx' });
  await service.processBatch('batch');
  assert.deepEqual(calls.map(c => c.name), ['claim_payout_dispatch', 'sendMoney', 'settle_payout_dispatch', 'claim_payout_dispatch']);
  assert.equal(calls[1].params.payoutAttemptId, 'attempt');
  assert.equal(calls[2].args.p_state, 'PROCESSING');
});
test('timeout ou réponse incomplète restent incertains, refus explicite échoue', async () => {
  for (const response of [new Error('timeout'), { success: true }, { success: false, uncertain: true }]) {
    const { service, calls } = fixture(response);
    await service.processBatch('batch');
    assert.equal(calls.find(c => c.name === 'settle_payout_dispatch').args.p_state, 'UNKNOWN');
  }
  const { service, calls } = fixture({ success: false, uncertain: false });
  await service.processBatch('batch');
  assert.equal(calls.find(c => c.name === 'settle_payout_dispatch').args.p_state, 'FAILED');
});
test('échec enregistrement après envoi ne propose pas une relance', async () => {
  const { service } = fixture({ success: true, transaction_id: 'tx' }, true);
  await assert.rejects(service.processBatch('batch'), /Ne pas relancer/);
});
test('mode manuel : aucun lot ni envoi automatique', async () => {
  let dispatched = false;
  const db = { from() { return { select() { return this; }, eq() { return this; }, async single() { return { data: { mode: 'manual' } }; } }; } };
  const service = createPayoutService({ db, sendMoney: async () => { dispatched = true; }, env: { PAYOUT_COMMISSION_PCT: '2', PAYOUT_WEBHOOK_SECRET: 'secret' } });
  await service.tick();
  assert.equal(dispatched, false);
});
