// Tests du bot WhatsApp Validèl — hermétiques (aucun réseau, aucune DB réelle).
// Lancer : node backend/tests/whatsapp-bot.test.js
//
// Couvre les critères d'acceptation du brief (adaptés à D7 : secret URL au lieu de HMAC,
// et lien produit existant au lieu de PayDunya).

// Le module lit WHATSAPP_WEBHOOK_SECRET / VALIDEL_COMMISSION_PCT au chargement -> définir AVANT require.
process.env.WHATSAPP_WEBHOOK_SECRET = 'testsecret';
process.env.VALIDEL_COMMISSION_PCT = '3';
process.env.PUBLIC_WEB_BASE_URL = 'https://www.validel.shop';

const assert = require('assert');
const bot = require('../whatsapp-bot');

let passed = 0;
let failed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed += 1; console.log('  ✓', name); })
    .catch((e) => { failed += 1; console.error('  ✗', name, '\n     ', e.message); });
}

// --- Stubs -----------------------------------------------------------------
const FAKE = {
  code: 'PD3431', nom: 'Caisse de Yaourt', prix: 15000,
  vendeurNom: 'Awa Ndiaye', vendeurQuartier: 'Colobane',
};
const findProduct = async (code) => (code === 'PD3431' ? FAKE : null);

function makeRecorder() {
  const sends = [];
  return {
    sends,
    sendText: async (to, body) => sends.push({ kind: 'text', to, body }),
    sendButtons: async (to, body, buttons) => sends.push({ kind: 'buttons', to, body, buttons }),
    sendCtaUrl: async (to, body, displayText, url) => sends.push({ kind: 'cta', to, body, displayText, url }),
  };
}

function makeBot(extra = {}) {
  const rec = makeRecorder();
  // Déduplication + mémoire de conversation en mémoire, propres à chaque bot :
  // garde les tests hermétiques (aucun accès aux vraies tables Supabase). Un
  // test qui veut sa propre logique peut la passer via `extra` (elle gagne).
  const seen = new Set();
  const isDuplicate = async (id) => { if (seen.has(id)) return true; seen.add(id); return false; };
  const convState = new Map();
  const getConversationState = async (phone) => convState.get(phone) || null;
  const setConversationState = async (phone, patch) => {
    const next = { ...(convState.get(phone) || {}), ...patch, updatedAt: Date.now() };
    convState.set(phone, next);
    return next;
  };
  // Stub IA par défaut : pas d'appel réseau réel dans les tests.
  const askProductQuestion = async (produit, question) => `Réponse IA test sur ${produit.nom} pour: ${question}`;
  const b = bot.createBot({
    findProduct, isDuplicate, getConversationState, setConversationState, askProductQuestion,
    ...rec, ...extra,
  });
  return { b, rec };
}

let _mid = 0;
const nextMid = () => `m${++_mid}`;
function inboundText(text, msgId, from = '221771112233') {
  return { event_content: { message: { msg_id: msgId || nextMid(), originator: from, message_type: 'TEXT', text: { body: text } } } };
}
function inboundButton(id, msgId, from = '221771112233') {
  return { event_content: { message: { msg_id: msgId || nextMid(), originator: from, message_type: 'INTERACTIVE', interactive: { button_reply: { id } } } } };
}
function mockReq(secret, body) { return { params: { secret }, body }; }
function mockRes() {
  return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
const flush = () => new Promise((r) => setTimeout(r, 30));

// --- Tests -----------------------------------------------------------------
(async () => {
  console.log('Bot WhatsApp Validèl — tests\n');

  // Unit : calcul des frais
  await test('computeFees(15000) @3% -> frais 450, total 15450', () => {
    assert.deepStrictEqual(bot.computeFees(15000), { prix: 15000, frais: 450, total: 15450 });
  });

  // Unit : extraction de code (crit. 6/7)
  await test('extractProductCode tolérant + insensible casse', () => {
    assert.strictEqual(bot.extractProductCode('bonjour PD3431 svp'), 'PD3431');
    assert.strictEqual(bot.extractProductCode('pd3431'), 'PD3431');
    assert.strictEqual(bot.extractProductCode('bonjour'), null);
  });

  // Crit. 3/4 : secret manquant / invalide -> 401
  await test('crit.3 secret manquant -> 401', () => {
    const { b } = makeBot();
    const res = mockRes();
    b.handler(mockReq('', inboundText('PD3431')), res);
    assert.strictEqual(res.statusCode, 401);
  });
  await test('crit.4 secret invalide -> 401', () => {
    const { b } = makeBot();
    const res = mockRes();
    b.handler(mockReq('wrong', inboundText('PD3431')), res);
    assert.strictEqual(res.statusCode, 401);
  });
  await test('secret correct -> 200 (ack immédiat)', () => {
    const { b } = makeBot();
    const res = mockRes();
    b.handler(mockReq('testsecret', inboundText('PD3431')), res);
    assert.strictEqual(res.statusCode, 200);
  });

  // Crit. 5/6/7 : code existant (variantes) -> fiche + 2 boutons
  for (const variant of ['PD3431', 'pd3431', 'bonjour PD3431 svp']) {
    await test(`crit.5-7 "${variant}" -> fiche + 2 boutons`, async () => {
      const { b, rec } = makeBot();
      await b.processWebhook(inboundText(variant));
      assert.strictEqual(rec.sends.length, 1);
      assert.strictEqual(rec.sends[0].kind, 'buttons');
      assert.strictEqual(rec.sends[0].buttons.length, 2);
      assert.strictEqual(rec.sends[0].buttons[0].id, 'pay:PD3431');
      assert.strictEqual(rec.sends[0].buttons[1].id, 'faq:PD3431');
      assert.ok(rec.sends[0].body.includes('Caisse de Yaourt'));
      assert.ok(rec.sends[0].body.length <= 1024, 'fiche <= 1024 car.');
      rec.sends[0].buttons.forEach((btn) => assert.ok(btn.title.length <= 20, 'titre bouton <= 20'));
    });
  }

  // Crit. 8 : code inexistant -> avertissement, pas de crash
  await test('crit.8 PD9999 -> avertissement', async () => {
    const { b, rec } = makeBot();
    await b.processWebhook(inboundText('PD9999'));
    assert.strictEqual(rec.sends.length, 1);
    assert.strictEqual(rec.sends[0].kind, 'text');
    assert.ok(rec.sends[0].body.includes("n'existe pas"));
  });

  // Crit. 9 : aucun code -> invite
  await test('crit.9 "bonjour" -> invite à donner un code', async () => {
    const { b, rec } = makeBot();
    await b.processWebhook(inboundText('bonjour'));
    assert.strictEqual(rec.sends.length, 1);
    assert.ok(rec.sends[0].body.includes('code produit'));
  });

  // Crit. 10 : payload sans message (DLR) -> pas de crash, pas d'envoi
  await test('crit.10 payload statut sans message -> sortie propre', async () => {
    const { b, rec } = makeBot();
    await b.processWebhook({ event_content: {} });
    await b.processWebhook({});
    assert.strictEqual(rec.sends.length, 0);
  });

  // Crit. 11 : même msg_id rejoué 2x -> une seule réponse (dédup au niveau handler)
  await test('crit.11 dédup : msg_id rejoué -> une seule réponse', async () => {
    const seen = new Set();
    const isDuplicate = async (id) => { if (seen.has(id)) return true; seen.add(id); return false; };
    const { b, rec } = makeBot({ isDuplicate });
    b.handler(mockReq('testsecret', inboundText('PD3431', 'dup-1')), mockRes());
    b.handler(mockReq('testsecret', inboundText('PD3431', 'dup-1')), mockRes());
    await flush();
    assert.strictEqual(rec.sends.length, 1, `attendu 1 envoi, obtenu ${rec.sends.length}`);
  });

  // Crit. 12 : bouton pay -> message CTA url vers /product/{code}
  await test('crit.12 pay:PD3431 -> CTA url /product/PD3431', async () => {
    const { b, rec } = makeBot();
    await b.processWebhook(inboundButton('pay:PD3431'));
    assert.strictEqual(rec.sends.length, 1);
    assert.strictEqual(rec.sends[0].kind, 'cta');
    assert.strictEqual(rec.sends[0].url, 'https://www.validel.shop/product/PD3431');
    assert.ok(rec.sends[0].displayText.length <= 20);
  });

  // Crit. 13 : bouton faq -> menu à 3 boutons
  await test('crit.13 faq:PD3431 -> menu 3 boutons', async () => {
    const { b, rec } = makeBot();
    await b.processWebhook(inboundButton('faq:PD3431'));
    assert.strictEqual(rec.sends.length, 1);
    assert.strictEqual(rec.sends[0].kind, 'buttons');
    assert.strictEqual(rec.sends[0].buttons.length, 3);
  });

  // FAQ réponse -> repropose « Payer en sécurité » ET « Autres questions »
  await test('faq:marche:PD3431 -> texte + boutons Payer & Autres questions', async () => {
    const { b, rec } = makeBot();
    await b.processWebhook(inboundButton('faq:marche:PD3431'));
    assert.strictEqual(rec.sends[0].kind, 'buttons');
    assert.strictEqual(rec.sends[0].buttons.length, 2);
    assert.strictEqual(rec.sends[0].buttons[0].id, 'pay:PD3431');
    assert.strictEqual(rec.sends[0].buttons[1].id, 'faq:PD3431');
    assert.ok(rec.sends[0].body.includes('protège'));
  });

  // Crit. 16 : « j'ai payé » -> aucun changement de statut (simple invite, aucune écriture)
  await test('crit.16 "j\'ai payé" -> invite seulement, aucun statut modifié', async () => {
    const { b, rec } = makeBot();
    await b.processWebhook(inboundText("j'ai payé"));
    assert.strictEqual(rec.sends.length, 1);
    assert.strictEqual(rec.sends[0].kind, 'text');
    assert.ok(rec.sends[0].body.includes('code produit'));
    // Le module n'expose et n'appelle aucune fonction de mutation de statut : garantie structurelle.
  });

  // Question libre APRÈS avoir consulté un produit -> réponse IA + 2 boutons
  await test('question libre après code produit -> réponse IA + boutons Payer/Autres', async () => {
    const { b, rec } = makeBot();
    await b.processWebhook(inboundText('PD3431')); // consulte le produit -> contexte actif
    await b.processWebhook(inboundText('est-ce que ça a une garantie ?'));
    assert.strictEqual(rec.sends.length, 2);
    assert.strictEqual(rec.sends[1].kind, 'buttons');
    assert.ok(rec.sends[1].body.includes('Caisse de Yaourt'));
    assert.strictEqual(rec.sends[1].buttons[0].id, 'pay:PD3431');
    assert.strictEqual(rec.sends[1].buttons[1].id, 'faq:PD3431');
  });

  // Question libre SANS avoir jamais consulté de produit -> invite classique (pas d'appel IA)
  await test('question libre sans contexte produit actif -> invite classique', async () => {
    const { b, rec } = makeBot();
    await b.processWebhook(inboundText('est-ce que ça a une garantie ?'));
    assert.strictEqual(rec.sends.length, 1);
    assert.strictEqual(rec.sends[0].kind, 'text');
    assert.ok(rec.sends[0].body.includes('code produit'));
  });

  // Accusé de réception ("Oui", "Merci"...) après une réponse IA -> réponse fixe,
  // PAS une nouvelle question IA (évite la réponse générique incohérente).
  await test('accusé "Oui" après réponse IA -> réponse fixe, IA non rappelée', async () => {
    let aiCalls = 0;
    const askProductQuestion = async () => { aiCalls += 1; return 'réponse IA'; };
    const { b, rec } = makeBot({ askProductQuestion });
    await b.processWebhook(inboundText('PD3431'));
    await b.processWebhook(inboundText('il y a une garantie ?'));
    assert.strictEqual(aiCalls, 1);
    await b.processWebhook(inboundText('Oui'));
    assert.strictEqual(aiCalls, 1, 'l\'IA ne doit pas être rappelée pour un simple "Oui"');
    const lastSend = rec.sends[rec.sends.length - 1];
    assert.strictEqual(lastSend.kind, 'buttons');
    assert.ok(lastSend.body.includes('Avec plaisir'));
    assert.strictEqual(lastSend.buttons[0].id, 'pay:PD3431');
  });

  // Garde-fou anti-abus : au-delà du quota, on n'appelle plus l'IA
  await test('quota IA dépassé -> message de garde-fou, IA non rappelée', async () => {
    let aiCalls = 0;
    const askProductQuestion = async () => { aiCalls += 1; return 'réponse'; };
    const { b, rec } = makeBot({ askProductQuestion });
    await b.processWebhook(inboundText('PD3431'));
    // 8 questions autorisées (WHATSAPP_AI_QA_MAX_PER_DAY par défaut) + 1 de trop
    for (let i = 0; i < 9; i += 1) {
      await b.processWebhook(inboundText(`question numéro ${i}`));
    }
    assert.strictEqual(aiCalls, 8, `attendu 8 appels IA, obtenu ${aiCalls}`);
    const lastSend = rec.sends[rec.sends.length - 1];
    assert.strictEqual(lastSend.kind, 'text');
    assert.ok(lastSend.body.includes('beaucoup de questions'));
  });

  console.log(`\n${passed} réussis, ${failed} échoués`);
  process.exit(failed === 0 ? 0 : 1);
})();
