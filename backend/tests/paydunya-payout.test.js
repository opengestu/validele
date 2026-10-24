const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPaydunyaPayout } = require('../paydunya-payout');
const env = { PAYDUNYA_MASTER_KEY: 'master', PAYDUNYA_PRIVATE_KEY: 'private', PAYDUNYA_TOKEN: 'token', PAYOUT_WEBHOOK_SECRET: 'secret' };
function fixture({ submitError, checkError, status = 'pending', amount = 9800, invoiceError = false, bindError = false } = {}) {
  const calls = [];
  const adapter = createPaydunyaPayout({ env, http: { async post(url, body) {
    const endpoint = url.split('/').at(-1); calls.push({ endpoint, body });
    if (endpoint === 'get-invoice') { if (invoiceError) throw new Error('invoice timeout'); return { data: { response_code: '00', disburse_token: 'pd-token' } }; }
    if (endpoint === 'submit-invoice') { if (submitError) throw new Error('submit timeout'); return { data: { response_code: '00' } }; }
    if (checkError) throw new Error('check timeout');
    return { data: { response_code: '00', token: 'pd-token', status, amount: String(amount) } };
  } } });
  return { calls, adapter, params: { amount: 9800, phone: '+221771111111', walletType: 'orange-senegal', payoutAttemptId: 'attempt', async recordReference(token) { calls.push({ endpoint: 'bind', token }); if (bindError) throw new Error('DB unavailable'); } } };
}
test('PayDunya : token enregistré avant soumission, compte et wallet corrects', async () => {
  const { adapter, params, calls } = fixture();
  const result = await adapter.sendMoney(params);
  assert.deepEqual(calls.map(c => c.endpoint), ['get-invoice', 'bind', 'submit-invoice', 'check-status']);
  assert.equal(calls[0].body.account_alias, '771111111');
  assert.equal(calls[0].body.withdraw_mode, 'orange-money-senegal');
  const callback = new URL(calls[0].body.callback_url);
  assert.equal(callback.searchParams.get('attempt_id'), 'attempt');
  assert.equal(callback.searchParams.get('payout_token'), 'secret');
  assert.equal(calls[2].body.disburse_id, 'attempt');
  assert.equal(result.transaction_id, 'paydunya:pd-token');
  assert.equal(result.verified_state, 'PROCESSING');
});
test('PayDunya : timeout de soumission résolu par statut succès du même token', async () => {
  const { adapter, params, calls } = fixture({ submitError: true, status: 'success' });
  const result = await adapter.sendMoney(params);
  assert.equal(result.verified_state, 'SUCCESSFUL');
  assert.equal(calls.filter(c => c.endpoint === 'submit-invoice').length, 1);
});
test('PayDunya : timeout après soumission ou montant inattendu => résultat incertain', async () => {
  for (const opts of [{ submitError: true, checkError: true }, { amount: 42 }]) {
    const { adapter, params } = fixture(opts);
    const result = await adapter.sendMoney(params);
    assert.equal(result.uncertain, true);
    assert.equal(result.transaction_id, 'paydunya:pd-token');
  }
});
test('PayDunya : statut final failed autorise un échec confirmé', async () => {
  const { adapter, params } = fixture({ status: 'failed' });
  assert.equal((await adapter.sendMoney(params)).verified_state, 'FAILED');
});
test('PayDunya : erreur avant soumission ne débite pas et n’appelle pas submit', async () => {
  for (const opts of [{ invoiceError: true }, { bindError: true }]) {
    const { adapter, params, calls } = fixture(opts);
    const result = await adapter.sendMoney(params);
    assert.equal(result.success, false); assert.equal(result.uncertain, false);
    assert.equal(calls.some(c => c.endpoint === 'submit-invoice'), false);
  }
});
test('PayDunya : sandbox ou clés absentes ne déclenchent aucun appel production', async () => {
  for (const config of [{}, { ...env, PAYDUNYA_MODE: 'sandbox' }]) {
    let called = false;
    const adapter = createPaydunyaPayout({ env: config, http: { post() { called = true; } } });
    await adapter.sendMoney({ amount: 100, phone: '771111111', walletType: 'wave-senegal', recordReference() {} });
    assert.equal(called, false);
  }
});
