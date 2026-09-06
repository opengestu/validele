const assert = require('assert');

process.env.NODE_ENV = 'production';
const { resolvePixpayRedirectUrl } = require('../pixpay');

const placeholder = resolvePixpayRedirectUrl(
  'https://example.com/success',
  '/payment-success',
  'order-123'
);
assert.strictEqual(
  placeholder,
  'https://www.validel.shop/payment-success?order_id=order-123'
);

const validel = resolvePixpayRedirectUrl(
  'https://www.validel.shop/payment-success?source=pixpay',
  '/payment-success',
  'order 123'
);
assert.strictEqual(
  validel,
  'https://www.validel.shop/payment-success?source=pixpay&order_id=order%20123'
);

const existingOrder = resolvePixpayRedirectUrl(
  'https://www.validel.shop/payment-success?order_id=already-there',
  '/payment-success',
  'other'
);
assert.strictEqual(existingOrder, 'https://www.validel.shop/payment-success?order_id=already-there');

console.log('3 redirections Pixpay validées');
