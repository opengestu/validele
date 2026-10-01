const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createReceiptCodes } = require('../receipt-code');
const order = { id: 'order-1', qr_code: 'private-client-qr' };

test('receipt code is stable, four digits, and tied to the order secret', () => {
  const codes = createReceiptCodes('server-secret');
  assert.match(codes.codeFor(order), /^\d{4}$/);
  assert.equal(codes.codeFor(order), codes.codeFor(order));
  assert.equal(codes.check(order, codes.codeFor(order)).ok, true);
  assert.equal(codes.check(order, '123').status, 400);
  assert.equal(codes.check(order, '12ab').status, 400);
});
test('leading zeros are preserved', () => {
  const codes = createReceiptCodes('server-secret');
  const candidate = Array.from({ length: 100 }, (_, i) => ({ id: String(i), qr_code: 'secret' })).find(item => codes.codeFor(item).startsWith('0'));
  assert.ok(candidate);
  assert.equal(codes.codeFor(candidate).length, 4);
  assert.equal(codes.check(candidate, codes.codeFor(candidate)).ok, true);
});
test('five failed attempts block this order for fifteen minutes', () => {
  const codes = createReceiptCodes('server-secret');
  const wrong = codes.codeFor(order) === '0000' ? '0001' : '0000';
  for (let i = 0; i < 5; i++) assert.equal(codes.check(order, wrong, 1000).status, 403);
  assert.equal(codes.check(order, codes.codeFor(order), 1001).status, 429);
  assert.equal(codes.check(order, codes.codeFor(order), 901001).ok, true);
});
test('confirmation proof is tied to the order, assigned actor, and expiration', () => {
  const codes = createReceiptCodes('server-secret');
  const proof = codes.proofFor('order-1', 'vendor-1', 1000);
  assert.equal(codes.verifyProof(proof, 'order-1', 'vendor-1', 1001), true);
  assert.equal(codes.verifyProof(proof, 'order-2', 'vendor-1', 1001), false);
  assert.equal(codes.verifyProof(proof, 'order-1', 'courier-2', 1001), false);
  assert.equal(codes.verifyProof(`${proof}x`, 'order-1', 'vendor-1', 1001), false);
  assert.equal(codes.verifyProof(proof, 'order-1', 'vendor-1', 301001), false);
});
