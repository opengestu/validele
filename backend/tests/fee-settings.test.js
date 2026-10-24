const { test } = require('node:test');
const assert = require('node:assert/strict');
const { protectionRate, readProtectionRate } = require('../fee-settings');
test('taux de protection enregistré prioritaire, zéro compris', async () => {
  assert.equal(protectionRate({ protection_fee_pct: 0 }, { VALIDEL_COMMISSION_PCT: '3' }), 0);
  assert.equal(protectionRate({}, { VALIDEL_COMMISSION_PCT: '3' }), 3);
  const db = { from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: { protection_fee_pct: 4 } }) }) };
  assert.equal(await readProtectionRate(db), 4);
  assert.throws(() => protectionRate({ protection_fee_pct: -1 }));
  await assert.rejects(readProtectionRate(null));
});
