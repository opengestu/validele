const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createReceiptCodes } = require('../receipt-code');
const source = fs.readFileSync(require.resolve('../whatsapp-bot'), 'utf8');
const code = source.slice(source.indexOf('async function recordDeliveryNotificationSent'), source.indexOf('async function notifyRefundProcessedWithFallback'));

function setup({ templateFails = false, freeFails = false } = {}) {
  const sent = [], tracked = [], sms = [], updates = [];
  const order = { id: 'order-1', qr_code: 'client-secret' };
  const query = {
    select() { return this; }, eq() { return this; },
    maybeSingle: async () => ({ data: order }),
    insert(row) { tracked.push(row); return Promise.resolve({}); },
    update(values) { updates.push(values); return this; },
  };
  const context = {
    crypto, console: { log() {}, warn() {}, error() {} }, process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'test-key' } },
    supabase: { from: () => query },
    PUBLIC_WEB_BASE_URL: 'https://www.validel.shop', PUBLIC_API_BASE_URL: 'https://validele.onrender.com',
    DELIVERY_TEMPLATE_NAME: 'commande_en_livraison_validel', DELIVERY_TEMPLATE_LANG: 'fr',
    sendWhatsAppTemplate: async (phone, payload) => { sent.push({ kind: 'template', payload }); if (templateFails) throw new Error('template failed'); return { data: { request_id: 'request-1' } }; },
    sendWhatsAppCtaUrl: async (phone, body) => { sent.push({ kind: 'free', body }); if (freeFails) throw new Error('free failed'); return { data: { request_id: 'request-2' } }; },
    require: name => {
      if (name === './receipt-code') return { createReceiptCodes };
      if (name === './direct7') return { sendSMS: async (phone, text) => sms.push(text) };
      throw new Error(`Unexpected require: ${name}`);
    },
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return { context, sent, tracked, sms, updates, order };
}
const args = { orderId: 'order-1', buyerPhone: '+221770000000', productName: 'Sac', trackingUrl: 'https://www.validel.shop/order/order-1', botNumber: null, receiptCode: '0042' };

test('approved WhatsApp template and deferred SMS both contain the same four-digit code', async () => {
  const { context, sent, tracked, sms } = setup();
  await context.notifyDeliveryStartedWithFallback(args);
  assert.equal(sent[0].payload.bodyParams.length, 1);
  assert.match(sent[0].payload.bodyParams[0], /0042/);
  assert.match(sent[0].payload.bodyParams[0], /Vérifiez le produit/);
  assert.match(tracked[0].fallback_sms_text, /0042/);
  assert.equal(sms.length, 0);
  await context.sendFallbackSmsForRow(tracked[0], 'non remis');
  assert.equal(sms[0], tracked[0].fallback_sms_text);
});
test('free WhatsApp fallback retains the code and receipt instructions', async () => {
  const { context, sent } = setup({ templateFails: true });
  await context.notifyDeliveryStartedWithFallback(args);
  assert.match(sent[1].body, /0042/);
  assert.match(sent[1].body, /réception du colis/);
});
test('failure of both WhatsApp sends sends an immediate SMS with the code', async () => {
  const { context, sms, updates } = setup({ templateFails: true, freeFails: true });
  await context.notifyDeliveryStartedWithFallback(args);
  assert.equal(sms.length, 1);
  assert.match(sms[0], /0042/);
  assert.equal(updates[0].sms_sent, true);
});
test('code resolved from the order matches the code displayed in the app', async () => {
  const { context, sent, order } = setup();
  await context.notifyDeliveryStartedWithFallback({ ...args, receiptCode: undefined });
  assert.ok(sent[0].payload.bodyParams[0].includes(createReceiptCodes('test-key').codeFor(order)));
});
test('old deferred delivery SMS rows are enriched with the receipt code', async () => {
  const { context, sms, order } = setup();
  await context.sendFallbackSmsForRow({ request_id: 'old', order_id: order.id, buyer_phone: args.buyerPhone, fallback_sms_text: 'Votre commande est en cours de livraison.' }, 'ancien');
  assert.ok(sms[0].includes(createReceiptCodes('test-key').codeFor(order)));
});
