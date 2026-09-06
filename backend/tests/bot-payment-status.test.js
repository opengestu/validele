const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readPaymentStatus, paymentReply } = require('../bot-payment-status');

function database(orders, payments, error = null) {
  const calls = [];
  return {
    calls,
    from(table) {
      const q = {};
      for (const method of ['select', 'in', 'eq', 'order', 'limit']) {
        q[method] = (...args) => { calls.push([table, method, ...args]); return q; };
      }
      q.then = (resolve, reject) => Promise.resolve({
        data: table === 'orders' ? orders : payments, error,
      }).then(resolve, reject);
      return q;
    },
  };
}
const order = { id: 'o1', order_code: 'YXA6797', status: 'pending', total_amount: 3000, payment_confirmed_at: null };
const payment = { provider: 'pixpay_wave', status: 'FAILED', amount: 3000, transaction_type: null };
const context = { phone: '+221781603455', text: "J'ai payé YXA6797" };

test('incident réel : FAILED ne confirme rien et recherche limitée à l’acheteur', async () => {
  const db = database([order], [payment]);
  const result = await readPaymentStatus(db, context);
  assert.equal(result.confirmed, false);
  assert.equal(result.failed, true);
  assert.ok(db.calls.some(c => c[1] === 'in' && c[2] === 'buyer_phone' && c[3].includes('+221781603455')));
  assert.ok(db.calls.some(c => c[1] === 'eq' && c[2] === 'order_code' && c[3] === 'YXA6797'));
  assert.match(await paymentReply(async () => result, context), /en échec/);
});

test('seule une confirmation serveur cohérente permet une réponse positive', async () => {
  const paid = { ...order, status: 'paid', payment_confirmed_at: '2026-09-06T06:00:00Z' };
  const success = { ...payment, status: 'SUCCESSFUL' };
  assert.equal((await readPaymentStatus(database([paid], [success]), context)).confirmed, true);
  for (const [o, p] of [
    [order, success], [paid, payment], [paid, { ...success, amount: 1 }],
    [paid, { ...success, transaction_type: 'refund' }],
    [{ ...paid, status: 'refunded' }, success],
    [order, { ...payment, status: 'PENDING1' }],
  ]) assert.equal((await readPaymentStatus(database([o], [p]), context)).confirmed, false);
});

test('aucune commande, ambiguïté et erreur : aucune confirmation', async () => {
  assert.equal(await readPaymentStatus(database([], []), context), null);
  assert.deepEqual(await readPaymentStatus(database([order, order], []), context), { ambiguous: true });
  const reply = await paymentReply(c => readPaymentStatus(database([], [], new Error('offline')), c), context);
  assert.match(reply, /ne peux pas confirmer/);
});
