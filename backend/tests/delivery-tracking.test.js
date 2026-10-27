// Isolated tracking adapter: no Supabase, SMS or WhatsApp request is sent.
process.env.ENABLE_WHATSAPP_READ_FALLBACK = 'false';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const uuid = '9024fb3a-2a8e-4cec-a753-610cc8d6d61b';
const compact = uuid.replace(/-/g, '');
let rows = [];
const fakeDb = {
  from(table) {
    assert.equal(table, 'whatsapp_delivery_read_tracking');
    const filters = []; let patch;
    const query = {
      select() { return this; },
      update(value) { patch = value; return this; },
      in(key, values) { filters.push(row => values.includes(row[key])); return this; },
      eq(key, value) { filters.push(row => row[key] === value); return this; },
      is(key, value) { return this.eq(key, value); },
      async run() { const found = rows.filter(row => filters.every(filter => filter(row))); if (patch) found.forEach(row => Object.assign(row, patch)); return { data: found[0] || null, error: null }; },
      maybeSingle() { return this.run(); },
      then(resolve, reject) { return this.run().then(resolve, reject); },
    }; return query;
  },
};
require.cache[require.resolve('../supabase')] = { exports: { supabase: fakeDb } };
const direct7 = require('../direct7');
let sent = 0;
direct7.sendSMS = async () => { sent++; };
const bot = require('../whatsapp-bot');
const row = requestId => ({ request_id: requestId, order_id: 'test-order', buyer_phone: 'test-phone', sms_sent: false, read_at: null, fallback_sms_text: 'Livraison : Code de secours TEST' });
test('rejet sans tirets retrouve la notification, lecture annule le secours et rejeu sans double envoi', async () => {
  rows = [row(uuid)];
  await bot.sendFallbackSmsNow(compact, 'failed', 'Re-engagement message');
  assert.equal(sent, 1); assert.equal(rows[0].sms_sent, true);
  await bot.sendFallbackSmsNow(compact, 'failed');
  assert.equal(sent, 1);
  rows = [row(uuid)];
  await bot.markDeliveryNotificationRead(compact);
  assert.ok(rows[0].read_at);
  await bot.sendFallbackSmsNow(compact, 'failed');
  assert.equal(sent, 1);
  rows = [row(compact)];
  await bot.markDeliveryNotificationRead(uuid);
  assert.ok(rows[0].read_at);
  rows = [row('req-unrelated')];
  await bot.sendFallbackSmsNow(compact, 'failed');
  assert.equal(sent, 1); assert.equal(rows[0].sms_sent, false);
});
