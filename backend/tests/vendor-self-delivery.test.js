const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../server.js'), 'utf8');
const start = source.indexOf("app.post('/api/orders/mark-in-delivery'");
const end = source.indexOf('// Helper function to get delivery person phone', start);

async function request(order, authenticated = true, expectedUpdate = false) {
  let handler;
  let updated = false;
  let values;
  const conditions = [];
  const query = {
    select() { return this; }, eq(key, value) { conditions.push([key, value]); return this; },
    is(key, value) { conditions.push([key, value]); return this; },
    maybeSingle: async () => ({ data: order }),
    update(data) { updated = true; values = { ...values, ...data }; return this; },
  };
  vm.runInNewContext(source.slice(start, end), {
    app: { post: (_, fn) => { handler = fn; } },
    jwt: { verify: () => { if (!authenticated) throw new Error('Invalid token'); return { sub: 'vendor-1' }; } },
    JWT_SECRET: 'test',
    supabase: { auth: { getUser: async () => ({ error: true }) }, from: () => query },
    process: { env: {} }, console: { log() {}, warn() {}, error() {} },
  });
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ body: { orderId: 'order-1', selfDelivery: true, deliveryPersonId: 'spoofed' }, headers: { authorization: 'Bearer test' } }, response);
  assert.equal(updated, expectedUpdate);
  if (expectedUpdate) {
    assert.equal(values.delivery_person_id, 'vendor-1');
    assert.equal(values.status, 'in_delivery');
    assert.ok(conditions.some(([key, value]) => key === 'status' && value === 'paid'));
    assert.ok(conditions.some(([key, value]) => key === 'delivery_person_id' && value === null));
  }
  return response.statusCode;
}

test('self delivery requires a verified session', async () => {
  assert.equal(await request(null, false), 401);
});
test('a vendor cannot deliver another vendor’s order', async () => {
  assert.equal(await request({ vendor_id: 'vendor-2', status: 'paid' }), 403);
});
test('a vendor cannot take an order assigned to a courier', async () => {
  assert.equal(await request({ vendor_id: 'vendor-1', status: 'paid', delivery_person_id: 'courier' }), 409);
});
test('unpaid and completed orders cannot start self delivery', async () => {
  for (const status of ['pending', 'delivered', 'cancelled', 'refunded', 'in_delivery']) {
    assert.equal(await request({ vendor_id: 'vendor-1', status }), 409);
  }
});
test('self delivery assigns the verified vendor, ignoring a supplied courier identity', async () => {
  assert.equal(await request({ id: 'order-1', vendor_id: 'vendor-1', status: 'paid' }, true, true), 200);
});
