process.env.DIRECT7_API_KEY = 'test-key';
process.env.WHATSAPP_BOT_NUMBER = '221700000000';
process.env.PUBLIC_API_BASE_URL = 'https://api.validel.test/';
process.env.WHATSAPP_WEBHOOK_SECRET = 'secret test';

const assert = require('assert');
const axios = require('axios');

const originalPost = axios.post;
const calls = [];
axios.post = async (url, payload) => {
  calls.push({ url, payload });
  return { data: { request_id: `req-${calls.length}`, status: 'accepted' } };
};

const direct7 = require('../direct7');

(async () => {
  try {
    assert.strictEqual(
      direct7.resolveWhatsAppReportUrl(),
      'https://api.validel.test/api/whatsapp/webhook/secret%20test'
    );

    await direct7.sendWhatsApp('221771112233', 'Bonjour');
    await direct7.sendWhatsAppCtaUrl(
      '221771112233',
      'Votre commande arrive',
      'Suivre',
      'https://www.validel.shop/order/test',
      undefined,
      { headerImageUrl: 'https://www.validel.shop/api/guest/order/test/qr.png' }
    );
    await direct7.sendWhatsAppTemplate('221771112233', {
      templateId: 'paiement_confirme_validel',
      language: 'fr',
      bodyParams: ['Peignoir', '10 000'],
      urlButtonSuffix: 'order-123',
    });

    assert.strictEqual(calls.length, 3);
    for (const call of calls) {
      assert.strictEqual(
        call.payload.messages[0].report_url,
        'https://api.validel.test/api/whatsapp/webhook/secret%20test'
      );
    }
    assert.deepStrictEqual(
      calls[2].payload.messages[0].content.template.body_parameter_values,
      { 0: 'Peignoir', 1: '10 000' }
    );
    assert.deepStrictEqual(
      calls[2].payload.messages[0].content.template.buttons.actions,
      [{ action_index: '0', action_type: 'url', action_payload: 'order-123' }]
    );
    assert.strictEqual(
      calls[1].payload.messages[0].content.interactive.header.image.link,
      'https://www.validel.shop/api/guest/order/test/qr.png'
    );
    console.log('  ✓ chaque envoi WhatsApp D7 contient son URL de rapport read');
    console.log('  ✓ le template paiement transmet ses deux variables approuvées');
  } finally {
    axios.post = originalPost;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
