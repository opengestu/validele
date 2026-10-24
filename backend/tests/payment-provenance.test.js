const { test } = require('node:test');
const assert = require('node:assert/strict');
const { registerPaymentProvenance } = require('../payment-provenance');

async function run({ status = 'completed', confirmedStatus = 'completed', amount = 10300, token = 'pd-token', writeError = false } = {}) {
  let handler; const writes = []; let next = false; let code = 200;
  registerPaymentProvenance({ use(paths, fn) { handler = fn; } }, {
    db: { from() { return { select() { return this; }, eq() { return this; }, async single() { return { data: { id: 'order', total_amount: 10300 } }; } }; }, async rpc(name, args) { writes.push({ name, args }); return writeError ? { error: { message: 'missing migration' } } : {}; } },
    http: { async get() { return { data: { response_code: '00', status: confirmedStatus, invoice: { token, total_amount: amount } } }; } }
  });
  const req = { method: 'POST', body: { data: { invoice: { token: 'pd-token' }, status } } };
  const res = { status(value) { code = value; return this; }, json() { return this; } };
  await handler(req, res, () => { next = true; });
  return { next, writes, code, req };
}
test('encaissement PayDunya enregistré après confirmation serveur et montant vérifié', async () => {
  const result = await run(); assert.equal(result.next, true);
  assert.equal(result.writes[0].name, 'record_paydunya_collection');
  assert.equal(result.writes[0].args.p_amount, 10300);
  assert.equal(result.req.body.token, 'pd-token');
});
test('fausse confirmation, token ou montant incohérent ne routent pas un payout', async () => {
  for (const options of [{ confirmedStatus: 'pending' }, { amount: 1 }, { token: 'other-token' }]) {
    const result = await run(options); assert.equal(result.next, false); assert.equal(result.code, 503); assert.equal(result.writes.length, 0);
  }
});
test('erreur écriture provenance empêche de poursuivre une fausse réussite', async () => {
  const result = await run({ writeError: true }); assert.equal(result.code, 503); assert.equal(result.next, false);
});
