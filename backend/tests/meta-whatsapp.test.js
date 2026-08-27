// Tests du transporteur Meta (bot DÉMO) — hermétiques : aucun réseau, aucune DB.
// Lancer : node backend/tests/meta-whatsapp.test.js
//
// Ce que ces tests prouvent :
//  1. parseMetaMessage produit EXACTEMENT la même forme que parseD7Message
//     -> le cerveau du bot fonctionne sans savoir qui est le transporteur.
//  2. Les 4 senders construisent des payloads Cloud API valides.
//  3. Le garde-fou anti-mélange refuse d'émettre un message prod via Meta.
//  4. La signature X-Hub-Signature-256 est vérifiée correctement.
//  5. Le parcours complet tourne de bout en bout sur un payload Meta réel.

// Les modules lisent leur config au chargement -> définir AVANT les require.
process.env.WHATSAPP_WEBHOOK_SECRET = 'testsecret';
process.env.VALIDEL_COMMISSION_PCT = '3';
process.env.PUBLIC_WEB_BASE_URL = 'https://www.validel.shop';
process.env.META_BOT_NUMBER = '221756509302';
process.env.META_PHONE_NUMBER_ID = '1346261105228979';
process.env.META_ACCESS_TOKEN = 'test-token';
process.env.META_APP_SECRET = 'test-app-secret';
process.env.META_WEBHOOK_VERIFY_TOKEN = 'test-verify';
process.env.META_WEBHOOK_SECRET = 'test-secret';
// Le numéro Meta doit être reconnu comme démo -> catalogue démo visible.
process.env.WHATSAPP_DEMO_BOT_NUMBERS = '221756509302';

const assert = require('assert');
const crypto = require('crypto');
const axios = require('axios');
const meta = require('../meta-whatsapp');
const bot = require('../whatsapp-bot');
const { isDemoBotNumber } = require('../demo');

const DEMO_NUMBER = '221756509302';
const PROD_NUMBER = '221768171175';
const BUYER = '221774254729';

let passed = 0;
let failed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed += 1; console.log('  ✓', name); })
    .catch((e) => { failed += 1; console.error('  ✗', name, '\n     ', e.message); });
}

// --- Interception axios : capture les payloads sans aucun appel réseau -----
const captured = [];
const realPost = axios.post;
function stubAxios(responder) {
  axios.post = async (url, payload, config) => {
    captured.push({ url, payload, config });
    if (typeof responder === 'function') return responder(url, payload, config);
    return { data: { messages: [{ id: 'wamid.TEST' }] } };
  };
}
function restoreAxios() { axios.post = realPost; }

// --- Constructeurs de payloads Meta entrants -------------------------------
function metaEnvelope(value) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: 'WABA-ID', changes: [{ field: 'messages', value }] }],
  };
}
function metaValue(extra, displayNumber = DEMO_NUMBER) {
  return {
    messaging_product: 'whatsapp',
    metadata: { display_phone_number: displayNumber, phone_number_id: '1346261105228979' },
    ...extra,
  };
}
function metaText(text, msgId = 'wamid.T1', from = BUYER, displayNumber = DEMO_NUMBER) {
  return metaEnvelope(metaValue({
    contacts: [{ profile: { name: 'Test' }, wa_id: from }],
    messages: [{ id: msgId, from, timestamp: '1756300000', type: 'text', text: { body: text } }],
  }, displayNumber));
}
function metaButtonReply(id, msgId = 'wamid.B1', from = BUYER) {
  return metaEnvelope(metaValue({
    messages: [{
      id: msgId, from, timestamp: '1756300000', type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id, title: 'Payer' } },
    }],
  }));
}
function metaListReply(id, msgId = 'wamid.L1', from = BUYER) {
  return metaEnvelope(metaValue({
    messages: [{
      id: msgId, from, timestamp: '1756300000', type: 'interactive',
      interactive: { type: 'list_reply', list_reply: { id, title: 'Colobane' } },
    }],
  }));
}
function metaStatus(status, id = 'wamid.S1', error = null) {
  const row = { id, status, timestamp: '1756300000', recipient_id: BUYER };
  if (error) row.errors = [error];
  return metaEnvelope(metaValue({ statuses: [row] }));
}

// --- Bot de test : parsers Meta + senders enregistreurs ---------------------
const FAKE = {
  code: 'PD0000', nom: 'Caisse de Yaourt', prix: 15000,
  vendeurNom: 'Awa Ndiaye', vendeurQuartier: 'Colobane',
  description: 'Caisse de 12 pots de yaourt nature, fabrication locale.',
};

function makeMetaBot(extra = {}) {
  const sends = [];
  const seen = new Set();
  const convState = new Map();
  const b = bot.createBot({
    parseMessage: meta.parseMetaMessage,
    parseStatusEvent: meta.parseMetaStatusEvent,
    findProduct: async (code) => (code === 'PD0000' ? FAKE : null),
    isDuplicate: async (id) => { if (seen.has(id)) return true; seen.add(id); return false; },
    getConversationState: async (p) => convState.get(p) || null,
    setConversationState: async (p, patch) => {
      const next = { ...(convState.get(p) || {}), ...patch, updatedAt: Date.now() };
      convState.set(p, next);
      return next;
    },
    askProductQuestion: async (produit, q) => `Réponse IA test sur ${produit.nom} pour: ${q}`,
    markDeliveryNotificationRead: async () => {},
    sendFallbackSmsNow: async (...args) => { sends.push({ kind: 'sms-fallback', args }); },
    createGuestOrder: async (payload) => ({
      success: true, orderId: 'ord-1', orderCode: 'VLD-0001',
      totalAmount: bot.computeFees(FAKE.prix).total, productName: FAKE.nom,
      buyerPhone: payload.buyerPhone,
    }),
    initiatePayment: async () => ({ url: 'https://pay.test/abc' }),
    sendText: async (to, body, from) => sends.push({ kind: 'text', to, body, from }),
    sendButtons: async (to, body, buttons, from, o = {}) => sends.push({ kind: 'buttons', to, body, buttons, from, headerImageUrl: o.headerImageUrl }),
    sendCtaUrl: async (to, body, displayText, url, from) => sends.push({ kind: 'cta', to, body, displayText, url, from }),
    sendList: async (to, body, buttonLabel, rows, from) => sends.push({ kind: 'list', to, body, buttonLabel, rows, from }),
    ...extra,
  });
  return { b, sends };
}

(async () => {
  console.log('\n--- parseMetaMessage : forme identique à parseD7Message ---');

  await test('message texte -> msgId / from / to / text', () => {
    const p = meta.parseMetaMessage(metaText('PD0000', 'wamid.X'));
    assert.strictEqual(p.msgId, 'wamid.X');
    assert.strictEqual(p.from, BUYER);
    assert.strictEqual(p.to, DEMO_NUMBER, '`to` doit venir de metadata.display_phone_number');
    assert.strictEqual(p.text, 'PD0000');
    assert.strictEqual(p.buttonId, null);
  });

  await test('les clés exposées sont exactement celles de parseD7Message', () => {
    const d7 = bot.parseD7Message({
      event_content: { message: { msg_id: 'm1', originator: BUYER, recipient: DEMO_NUMBER, message_type: 'TEXT', text: { body: 'PD0000' } } },
    });
    const m = meta.parseMetaMessage(metaText('PD0000'));
    assert.deepStrictEqual(Object.keys(m).sort(), Object.keys(d7).sort());
  });

  await test('display_phone_number avec + et espaces -> normalisé en chiffres', () => {
    const p = meta.parseMetaMessage(metaText('PD0000', 'wamid.N', BUYER, '+221 75 650 93 02'));
    assert.strictEqual(p.to, DEMO_NUMBER);
  });

  await test('bouton interactif -> buttonId', () => {
    const p = meta.parseMetaMessage(metaButtonReply('pay:PD0000'));
    assert.strictEqual(p.buttonId, 'pay:PD0000');
  });

  await test('ligne de liste -> buttonId', () => {
    const p = meta.parseMetaMessage(metaListReply('quartier:Colobane'));
    assert.strictEqual(p.buttonId, 'quartier:Colobane');
  });

  await test('payload de statut (aucun message) -> null', () => {
    assert.strictEqual(meta.parseMetaMessage(metaStatus('delivered')), null);
  });

  await test('payload vide / malformé -> null, pas de crash', () => {
    assert.strictEqual(meta.parseMetaMessage(null), null);
    assert.strictEqual(meta.parseMetaMessage({}), null);
    assert.strictEqual(meta.parseMetaMessage({ entry: [] }), null);
    assert.strictEqual(meta.parseMetaMessage({ entry: [{ changes: [{ value: {} }] }] }), null);
  });

  console.log('\n--- parseMetaStatusEvent ---');

  await test('statut failed avec erreur -> motif exploitable (#131037)', () => {
    const s = meta.parseMetaStatusEvent(metaStatus('failed', 'wamid.F', {
      code: 131037, title: 'Display name approval required',
    }));
    assert.strictEqual(s.status, 'failed');
    assert.ok(s.reason.includes('131037'), `motif inattendu: ${s.reason}`);
  });

  await test('payload de message (aucun statut) -> null', () => {
    assert.strictEqual(meta.parseMetaStatusEvent(metaText('PD0000')), null);
  });

  console.log('\n--- Senders : payloads Cloud API ---');

  await test('sendText construit un payload texte valide', async () => {
    captured.length = 0; stubAxios();
    await meta.sendText('+221774254729', 'Bonjour', DEMO_NUMBER);
    restoreAxios();
    assert.strictEqual(captured.length, 1);
    const { url, payload, config } = captured[0];
    assert.ok(url.endsWith('/1346261105228979/messages'), `url inattendue: ${url}`);
    assert.strictEqual(config.headers.Authorization, 'Bearer test-token');
    assert.strictEqual(payload.messaging_product, 'whatsapp');
    assert.strictEqual(payload.to, BUYER, 'le + doit être retiré');
    assert.strictEqual(payload.type, 'text');
    assert.strictEqual(payload.text.body, 'Bonjour');
  });

  await test('sendButtons : 3 boutons max, titre tronqué à 20', async () => {
    captured.length = 0; stubAxios();
    await meta.sendButtons(BUYER, 'Corps', [
      { id: 'a', title: 'Un titre beaucoup trop long pour WhatsApp' },
      { id: 'b', title: 'B' }, { id: 'c', title: 'C' }, { id: 'd', title: 'D' },
    ], DEMO_NUMBER);
    restoreAxios();
    const i = captured[0].payload.interactive;
    assert.strictEqual(i.type, 'button');
    assert.strictEqual(i.action.buttons.length, 3, 'WhatsApp plafonne à 3 boutons');
    assert.strictEqual(i.action.buttons[0].reply.title.length, 20);
    assert.strictEqual(i.action.buttons[0].type, 'reply');
  });

  await test('sendButtons : en-tête image refusé -> renvoi sans image', async () => {
    captured.length = 0;
    let n = 0;
    stubAxios(async (url, payload) => {
      n += 1;
      if (payload.interactive.header) {
        const e = new Error('rejected');
        e.response = { data: { error: { code: 131009, message: 'Bad header' } } };
        throw e;
      }
      return { data: { messages: [{ id: 'wamid.OK' }] } };
    });
    await meta.sendButtons(BUYER, 'Corps', [{ id: 'a', title: 'A' }], DEMO_NUMBER, {
      headerImageUrl: 'https://www.validel.shop/images/wallets-wave-orange.png',
    });
    restoreAxios();
    assert.strictEqual(n, 2, 'doit retenter une fois sans en-tête');
    assert.ok(!captured[1].payload.interactive.header, 'le 2e envoi ne doit pas porter d\'en-tête');
  });

  await test('sendCtaUrl construit un interactive cta_url', async () => {
    captured.length = 0; stubAxios();
    await meta.sendCtaUrl(BUYER, 'Payez ici', 'Payer maintenant', 'https://pay.test/abc', DEMO_NUMBER);
    restoreAxios();
    const i = captured[0].payload.interactive;
    assert.strictEqual(i.type, 'cta_url');
    assert.strictEqual(i.action.name, 'cta_url');
    assert.strictEqual(i.action.parameters.url, 'https://pay.test/abc');
  });

  await test('sendList : 10 lignes max + sections', async () => {
    captured.length = 0; stubAxios();
    const rows = Array.from({ length: 14 }, (_, k) => ({ id: `q${k}`, title: `Quartier ${k}` }));
    await meta.sendList(BUYER, 'Choisissez', 'Quartiers', rows, DEMO_NUMBER);
    restoreAxios();
    const i = captured[0].payload.interactive;
    assert.strictEqual(i.type, 'list');
    assert.strictEqual(i.action.button, 'Quartiers');
    assert.strictEqual(i.action.sections[0].rows.length, 10, 'WhatsApp plafonne à 10 lignes');
  });

  await test('erreur Meta -> message lisible avec le code (#131037)', async () => {
    stubAxios(async () => {
      const e = new Error('Request failed');
      e.response = { data: { error: { code: 131037, message: 'display name approval required' } } };
      throw e;
    });
    let caught = null;
    try { await meta.sendText(BUYER, 'x', DEMO_NUMBER); } catch (e) { caught = e; }
    restoreAxios();
    assert.ok(caught, 'une erreur devait remonter');
    assert.ok(caught.message.includes('131037'), `message inattendu: ${caught.message}`);
    assert.strictEqual(caught.metaCode, 131037);
  });

  console.log('\n--- Garde-fou anti-mélange prod/démo ---');

  await test('resolvePhoneNumberId accepte le numéro démo', () => {
    assert.strictEqual(meta.resolvePhoneNumberId(DEMO_NUMBER), '1346261105228979');
    assert.strictEqual(meta.resolvePhoneNumberId(null), '1346261105228979');
  });

  await test('émettre depuis le numéro PROD via Meta -> refus explicite', async () => {
    captured.length = 0; stubAxios();
    let caught = null;
    try { await meta.sendText(BUYER, 'fuite prod', PROD_NUMBER); } catch (e) { caught = e; }
    restoreAxios();
    assert.ok(caught, 'un envoi prod via Meta doit échouer');
    assert.ok(caught.message.includes(PROD_NUMBER), caught.message);
    assert.strictEqual(captured.length, 0, 'aucun appel réseau ne doit partir');
  });

  console.log('\n--- Signature X-Hub-Signature-256 ---');

  const raw = JSON.stringify(metaText('PD0000'));
  const goodSig = 'sha256=' + crypto.createHmac('sha256', 'test-app-secret').update(raw).digest('hex');

  await test('signature valide -> acceptée', () => {
    assert.strictEqual(meta.verifySignature(raw, goodSig), true);
  });

  await test('signature falsifiée -> refusée', () => {
    const bad = 'sha256=' + '0'.repeat(64);
    assert.strictEqual(meta.verifySignature(raw, bad), false);
  });

  await test('corps altéré avec la même signature -> refusée', () => {
    assert.strictEqual(meta.verifySignature(raw + ' ', goodSig), false);
  });

  await test('en-tête absent ou mal préfixé -> refusée', () => {
    assert.strictEqual(meta.verifySignature(raw, ''), false);
    assert.strictEqual(meta.verifySignature(raw, undefined), false);
    assert.strictEqual(meta.verifySignature(raw, 'sha1=abc'), false);
  });

  console.log('\n--- Parcours de bout en bout sur payload Meta ---');

  await test('le numéro Meta est reconnu comme numéro démo', () => {
    assert.strictEqual(isDemoBotNumber(DEMO_NUMBER), true);
    assert.strictEqual(isDemoBotNumber(PROD_NUMBER), false);
  });

  await test('code produit -> réponse émise DEPUIS le numéro démo', async () => {
    const { b, sends } = makeMetaBot();
    await b.processWebhook(metaText('PD0000', 'wamid.E2E'));
    assert.ok(sends.length >= 1, 'le bot doit répondre');
    assert.strictEqual(sends[0].to, BUYER);
    assert.strictEqual(sends[0].from, DEMO_NUMBER, 'réponse depuis le numéro démo');
    assert.ok(String(sends[0].body).includes(FAKE.nom), 'la fiche produit doit citer le produit');
  });

  await test('code inconnu -> réponse quand même émise depuis le numéro démo', async () => {
    const { b, sends } = makeMetaBot();
    await b.processWebhook(metaText('PD9999', 'wamid.UNK'));
    assert.ok(sends.length >= 1);
    assert.strictEqual(sends[0].from, DEMO_NUMBER);
  });

  await test('déduplication : même msgId rejoué -> une seule réponse', async () => {
    const { b, sends } = makeMetaBot();
    await b.processWebhook(metaText('PD0000', 'wamid.DUP'));
    const n = sends.length;
    await b.processWebhook(metaText('PD0000', 'wamid.DUP'));
    assert.strictEqual(sends.length, n, 'le rejeu ne doit rien renvoyer');
  });

  await test('bouton "payer" -> le parcours enchaîne depuis le numéro démo', async () => {
    const { b, sends } = makeMetaBot();
    await b.processWebhook(metaText('PD0000', 'wamid.P1'));
    sends.length = 0;
    await b.processWebhook(metaButtonReply('pay:PD0000', 'wamid.P2'));
    assert.ok(sends.length >= 1, 'le bouton doit déclencher une suite');
    assert.strictEqual(sends[0].from, DEMO_NUMBER);
  });

  await test('statut failed -> tracé, AUCUN SMS de secours envoyé', async () => {
    let smsCalls = 0;
    const { b } = makeMetaBot({ sendFallbackSmsNow: async () => { smsCalls += 1; } });
    await b.processWebhook(metaStatus('failed', 'wamid.FAIL', { code: 131037, title: 'Display name approval required' }));
    // Le handler injecté est appelé (trace), mais il ne déclenche aucun SMS réel :
    // c'est exactement ce que registerMetaWhatsAppBot câble en production.
    assert.strictEqual(smsCalls, 1, 'le handler de trace doit être appelé');
  });

  await test('statut delivered -> aucune réponse déclenchée', async () => {
    const { b, sends } = makeMetaBot();
    await b.processWebhook(metaStatus('delivered', 'wamid.DLV'));
    assert.strictEqual(sends.length, 0);
  });

  console.log('\n--- Route webhook réelle (express, port éphémère) ---');

  // Monte le vrai registerMetaWhatsAppBot sur un express jetable, avec la MÊME
  // capture de rawBody que server.js. C'est la partie la plus risquée du montage
  // (challenge GET + signature HMAC) : la tester à la main sur Meta coûte un
  // aller-retour de configuration à chaque essai.
  const express = require('express');
  const app = express();
  app.use(express.json({
    limit: '5mb',
    verify: (req, res, buf, encoding) => {
      try { req.rawBody = buf.toString(encoding || 'utf8'); } catch (e) { req.rawBody = ''; }
    },
  }));

  const routeSends = [];
  meta.registerMetaWhatsAppBot(app, {
    findProduct: async (code) => (code === 'PD0000' ? FAKE : null),
    isDuplicate: async () => false,
    getConversationState: async () => null,
    setConversationState: async () => ({}),
    askProductQuestion: async () => 'stub',
    createGuestOrder: async () => ({ success: true, orderId: 'o', orderCode: 'VLD-1', totalAmount: 1, productName: FAKE.nom, buyerPhone: BUYER }),
    initiatePayment: async () => ({ url: 'https://pay.test/abc' }),
    sendText: async (to, body, from) => routeSends.push({ kind: 'text', to, body, from }),
    sendButtons: async (to, body, buttons, from) => routeSends.push({ kind: 'buttons', to, body, buttons, from }),
    sendCtaUrl: async (to, body, d, url, from) => routeSends.push({ kind: 'cta', to, from }),
    sendList: async (to, body, l, rows, from) => routeSends.push({ kind: 'list', to, from }),
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/whatsapp/webhook/meta`;
  const sign = (body) => 'sha256=' + crypto.createHmac('sha256', 'test-app-secret').update(body).digest('hex');

  await test('GET challenge : bon secret + bon verify_token -> renvoie hub.challenge', async () => {
    const r = await fetch(`${base}/test-secret?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=CHALLENGE123`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(await r.text(), 'CHALLENGE123', 'Meta exige le challenge brut, sans JSON');
  });

  await test('GET challenge : mauvais verify_token -> 403', async () => {
    const r = await fetch(`${base}/test-secret?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=X`);
    assert.strictEqual(r.status, 403);
  });

  await test('GET challenge : mauvais secret d\'URL -> 401', async () => {
    const r = await fetch(`${base}/MAUVAIS?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=X`);
    assert.strictEqual(r.status, 401);
  });

  await test('POST signé -> 200 et le parcours se déclenche', async () => {
    routeSends.length = 0;
    const body = JSON.stringify(metaText('PD0000', 'wamid.ROUTE1'));
    const r = await fetch(`${base}/test-secret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sign(body) },
      body,
    });
    assert.strictEqual(r.status, 200);
    // Le traitement est différé (setImmediate) pour acquitter Meta au plus vite.
    await new Promise((res) => setTimeout(res, 60));
    assert.ok(routeSends.length >= 1, 'le webhook doit avoir déclenché une réponse');
    assert.strictEqual(routeSends[0].from, DEMO_NUMBER);
  });

  await test('POST sans signature -> 401, aucun traitement', async () => {
    routeSends.length = 0;
    const body = JSON.stringify(metaText('PD0000', 'wamid.ROUTE2'));
    const r = await fetch(`${base}/test-secret`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    });
    assert.strictEqual(r.status, 401);
    await new Promise((res) => setTimeout(res, 60));
    assert.strictEqual(routeSends.length, 0);
  });

  await test('POST avec corps altéré après signature -> 401', async () => {
    routeSends.length = 0;
    const body = JSON.stringify(metaText('PD0000', 'wamid.ROUTE3'));
    const r = await fetch(`${base}/test-secret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sign(body) },
      body: body.replace('PD0000', 'PD9999'),
    });
    assert.strictEqual(r.status, 401);
    await new Promise((res) => setTimeout(res, 60));
    assert.strictEqual(routeSends.length, 0);
  });

  await test('la route D7 n\'est PAS montée par le bot démo (isolation)', async () => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/whatsapp/webhook/testsecret`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.strictEqual(r.status, 404, 'seul registerWhatsAppBot doit monter la route D7');
  });

  await new Promise((res) => server.close(res));

  console.log(`\n${passed} réussis, ${failed} échoués\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
