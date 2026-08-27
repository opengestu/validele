// Tests du bot WhatsApp Validèl — hermétiques (aucun réseau, aucune DB réelle).
// Lancer : node backend/tests/whatsapp-bot.test.js
//
// Couvre les critères d'acceptation du brief (adaptés à D7 : secret URL au lieu de HMAC,
// et lien produit existant au lieu de PayDunya).

// Le module lit WHATSAPP_WEBHOOK_SECRET / VALIDEL_COMMISSION_PCT au chargement -> définir AVANT require.
process.env.WHATSAPP_WEBHOOK_SECRET = 'testsecret';
process.env.VALIDEL_COMMISSION_PCT = '3';
process.env.PUBLIC_WEB_BASE_URL = 'https://www.validel.shop';
process.env.WHATSAPP_WALLET_BANNER_URL = 'https://www.validel.shop/images/wallets-wave-orange.png';

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
  description: 'Caisse de 12 pots de yaourt nature, fabrication locale.',
};
const findProduct = async (code) => (code === 'PD3431' ? FAKE : null);

function makeRecorder() {
  const sends = [];
  return {
    sends,
    sendText: async (to, body, from) => sends.push({ kind: 'text', to, body, from }),
    sendButtons: async (to, body, buttons, from, options = {}) => sends.push({ kind: 'buttons', to, body, buttons, from, headerImageUrl: options.headerImageUrl }),
    sendCtaUrl: async (to, body, displayText, url, from) => sends.push({ kind: 'cta', to, body, displayText, url, from }),
    sendList: async (to, body, buttonLabel, rows, from) => sends.push({ kind: 'list', to, body, buttonLabel, rows, from }),
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
  // Stub no-op par défaut : évite de toucher la vraie table Supabase si un test
  // envoie par erreur un événement de statut sans l'injecter explicitement.
  const markDeliveryNotificationRead = async () => {};
  const sendFallbackSmsNow = async () => {};
  // Stubs du checkout conversationnel : aucune commande ni paiement réel. `orders`
  // permet de vérifier ce qui a été transmis à /api/guest/order.
  const orders = [];
  const createGuestOrder = async (payload) => {
    orders.push(payload);
    return {
      success: true,
      orderId: 'ord-1',
      orderCode: 'VLD-0001',
      totalAmount: bot.computeFees(FAKE.prix).total,
      productName: FAKE.nom,
      buyerPhone: payload.buyerPhone,
    };
  };
  const initiatePayment = async () => ({ url: 'https://pay.test/abc' });
  const b = bot.createBot({
    findProduct, isDuplicate, getConversationState, setConversationState, askProductQuestion,
    markDeliveryNotificationRead, sendFallbackSmsNow, createGuestOrder, initiatePayment, ...rec, ...extra,
  });
  return { b, rec, orders };
}

let _mid = 0;
const nextMid = () => `m${++_mid}`;
function inboundText(text, msgId, from = '221771112233', recipient = undefined) {
  const message = { msg_id: msgId || nextMid(), originator: from, message_type: 'TEXT', text: { body: text } };
  if (recipient !== undefined) message.recipient = recipient;
  return { event_content: { message } };
}
function inboundStatusEvent(requestId, status, reason) {
  const message_status = { request_id: requestId, msg_id: 'wamid.abc', status, recipient: '+221771112233' };
  if (reason) message_status.reason = reason;
  return {
    event: { event_type: 'DELIVERY_EVENTS' },
    event_content: { message_status },
  };
}
// Sélection d'une ligne de liste : D7 renvoie `list_reply.id` (et non `button_reply`).
function inboundListReply(id, msgId, from = '221771112233', recipient = undefined) {
  const message = { msg_id: msgId || nextMid(), originator: from, message_type: 'INTERACTIVE', interactive: { list_reply: { id } } };
  if (recipient !== undefined) message.recipient = recipient;
  return { event_content: { message } };
}
function inboundButton(id, msgId, from = '221771112233', recipient = undefined) {
  const message = { msg_id: msgId || nextMid(), originator: from, message_type: 'INTERACTIVE', interactive: { button_reply: { id } } };
  if (recipient !== undefined) message.recipient = recipient;
  return { event_content: { message } };
}
function mockReq(secret, body) { return { params: { secret }, body }; }
function mockRes() {
  return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
const flush = () => new Promise((r) => setTimeout(r, 30));

// --- Tests -----------------------------------------------------------------
(async () => {
  console.log('Bot WhatsApp Validèl — tests\n');

  // La bannière de paiement n'est active qu'après vérification de son URL (le
  // contrôle lui-même est testé en fin de fichier). On la valide ici avec une
  // fausse réponse image/png, sinon aucun message de paiement ne porterait d'en-tête.
  await bot.verifyWalletBanner(async () => ({
    ok: true, status: 200, headers: { get: () => 'image/png' },
  }));

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

  // La fiche produit inclut la description (compréhensible, pas juste le code)
  await test('fiche produit -> inclut la description du produit', async () => {
    const { b, rec } = makeBot();
    await b.processWebhook(inboundText('PD3431'));
    assert.strictEqual(rec.sends[0].kind, 'buttons');
    assert.ok(rec.sends[0].body.includes('12 pots de yaourt'), 'la description doit apparaître dans la fiche');
  });

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

  // Crit. 12 (révisé) : le bouton « Payer » ouvre désormais le checkout dans le chat.
  // L'ancien envoi direct du lien web reste accessible via WHATSAPP_CHAT_CHECKOUT=false.
  await test('crit.12 pay:PD3431 -> démarre le checkout et demande le nom', async () => {
    const { b, rec } = makeBot();
    await b.processWebhook(inboundButton('pay:PD3431'));
    assert.strictEqual(rec.sends.length, 1);
    assert.strictEqual(rec.sends[0].kind, 'text');
    assert.ok(/pr[ée]nom et nom/i.test(rec.sends[0].body), 'doit demander le nom');
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

  // Fallback SMS anti-doublon : parsing de l'accusé de statut D7
  await test('parseD7StatusEvent reconnaît un accusé "read" et extrait request_id', () => {
    const parsed = bot.parseD7StatusEvent(inboundStatusEvent('req-123', 'read'));
    assert.deepStrictEqual(parsed, { requestId: 'req-123', msgId: 'wamid.abc', status: 'read', recipient: '+221771112233', reason: null });
  });
  await test('parseD7StatusEvent extrait le motif de rejet opérateur', () => {
    const parsed = bot.parseD7StatusEvent(inboundStatusEvent('req-rej', 'rejected', '(#132018) template button issue'));
    assert.strictEqual(parsed.status, 'rejected');
    assert.strictEqual(parsed.reason, '(#132018) template button issue');
  });
  await test('parseD7StatusEvent renvoie null pour un message entrant normal', () => {
    assert.strictEqual(bot.parseD7StatusEvent(inboundText('PD3431')), null);
  });

  // Un accusé "read" marque la lecture (annule le SMS de secours) SANS déclencher
  // de réponse du bot (ce n'est pas un message, pas d'action à exécuter).
  await test('webhook accusé "read" -> markDeliveryNotificationRead appelé, aucune réponse envoyée', async () => {
    let markedRequestId = null;
    const markDeliveryNotificationRead = async (requestId) => { markedRequestId = requestId; };
    const { b, rec } = makeBot({ markDeliveryNotificationRead });
    await b.processWebhook(inboundStatusEvent('req-456', 'read'));
    assert.strictEqual(markedRequestId, 'req-456');
    assert.strictEqual(rec.sends.length, 0);
  });

  // Un accusé "delivered" (pas "read") ne doit PAS annuler le fallback SMS.
  await test('webhook accusé "delivered" -> markDeliveryNotificationRead NON appelé', async () => {
    let called = false;
    const markDeliveryNotificationRead = async () => { called = true; };
    const { b, rec } = makeBot({ markDeliveryNotificationRead });
    await b.processWebhook(inboundStatusEvent('req-789', 'delivered'));
    assert.strictEqual(called, false);
    assert.strictEqual(rec.sends.length, 0);
  });

  // Rejet opérateur (cas réel : template Meta refusé #132018) -> le WhatsApp ne
  // sera jamais remis, on n'attend pas les 10 min du reconciler : SMS immédiat.
  await test('webhook accusé "rejected" -> SMS de secours immédiat avec le motif', async () => {
    const calls = [];
    const sendFallbackSmsNow = async (requestId, status, reason) => { calls.push({ requestId, status, reason }); };
    const { b, rec } = makeBot({ sendFallbackSmsNow });
    await b.processWebhook(inboundStatusEvent('req-rejected', 'rejected', '(#132018) does not require parameters'));
    assert.deepStrictEqual(calls, [{ requestId: 'req-rejected', status: 'rejected', reason: '(#132018) does not require parameters' }]);
    assert.strictEqual(rec.sends.length, 0);
  });

  await test('webhook accusé "failed" -> SMS de secours immédiat', async () => {
    const calls = [];
    const sendFallbackSmsNow = async (requestId, status) => { calls.push({ requestId, status }); };
    const { b } = makeBot({ sendFallbackSmsNow });
    await b.processWebhook(inboundStatusEvent('req-failed', 'failed'));
    assert.deepStrictEqual(calls, [{ requestId: 'req-failed', status: 'failed' }]);
  });

  // Un statut intermédiaire ne doit surtout pas déclencher de SMS : le WhatsApp
  // peut encore être lu, et on n'envoie JAMAIS les deux canaux à la fois.
  await test('webhook accusés "sent"/"delivered"/"read" -> aucun SMS immédiat', async () => {
    let called = 0;
    const sendFallbackSmsNow = async () => { called += 1; };
    const { b } = makeBot({ sendFallbackSmsNow });
    await b.processWebhook(inboundStatusEvent('req-s', 'sent'));
    await b.processWebhook(inboundStatusEvent('req-d', 'delivered'));
    await b.processWebhook(inboundStatusEvent('req-r', 'read'));
    assert.strictEqual(called, 0);
  });

  // --- Routage multi-numéro (prod + démo sur un seul backend/webhook) --------
  // parseD7Message expose le numéro business qui a REÇU le message (champ D7
  // `recipient`) via `to`, pour répondre depuis ce même numéro.
  await test('parseD7Message extrait le destinataire (recipient) dans `to`', () => {
    const parsed = bot.parseD7Message(inboundText('PD3431', 'm-to', '221771112233', '15554677146'));
    assert.strictEqual(parsed.to, '15554677146');
    assert.strictEqual(parsed.from, '221771112233');
  });

  await test('recipient absent -> `to` null (repli numéro par défaut)', () => {
    const parsed = bot.parseD7Message(inboundText('PD3431', 'm-nulto'));
    assert.strictEqual(parsed.to, null);
  });

  // Message reçu sur le NUMÉRO DÉMO -> le bot répond DEPUIS le numéro démo
  // (le `from` transmis aux fonctions d'envoi = le recipient entrant).
  await test('message vers le numéro démo -> réponse émise DEPUIS le numéro démo', async () => {
    const { b, rec } = makeBot();
    await b.processWebhook(inboundText('PD3431', 'm-demo', '221771112233', '15554677146'));
    assert.strictEqual(rec.sends.length, 1);
    assert.strictEqual(rec.sends[0].from, '15554677146', 'le bot doit répondre depuis le numéro démo');
  });

  // Message reçu sur le NUMÉRO PROD -> réponse depuis le numéro prod (isolation).
  await test('message vers le numéro prod -> réponse émise DEPUIS le numéro prod', async () => {
    const { b, rec } = makeBot();
    await b.processWebhook(inboundText('PD3431', 'm-prod', '221771112233', '221768171175'));
    assert.strictEqual(rec.sends[0].from, '221768171175');
  });

  // Rétrocompatibilité : sans recipient, `from` reste indéfini -> les fonctions
  // d'envoi retombent sur WHATSAPP_BOT_NUMBER (comportement historique).
  await test('sans recipient -> from indéfini (repli sur le numéro par défaut)', async () => {
    const { b, rec } = makeBot();
    await b.processWebhook(inboundText('PD3431', 'm-legacy'));
    assert.strictEqual(rec.sends[0].from, null);
  });

  // --- Persistance du numéro de bot sur la commande (migration 008) ----------
  // Répondre depuis le bon numéro ne suffit pas : le numéro ne vit que le temps
  // du webhook. Sans le figer sur la commande, les notifications ultérieures
  // (livraison, remboursement, paiement confirmé) repartent du numéro par défaut,
  // donc dans une AUTRE conversation que celle où l'acheteur a commandé.
  await test('checkout depuis le numéro démo -> botNumber transmis à la commande', async () => {
    const { b, orders } = makeBot();
    const DEMO = '15554677146';
    await b.processWebhook(inboundButton('pay:PD3431', 'm-bn1', '221771112233', DEMO));
    await b.processWebhook(inboundText('Awa Diop', 'm-bn2', '221771112233', DEMO));
    await b.processWebhook(inboundListReply('co:z:0:PD3431', 'm-bn3', '221771112233', DEMO));
    await b.processWebhook(inboundButton('co:w:PD3431', 'm-bn4', '221771112233', DEMO));
    assert.strictEqual(orders.length, 1, 'une commande doit être créée');
    assert.strictEqual(orders[0].botNumber, DEMO, 'la commande doit porter le numéro démo');
  });

  await test('checkout sans recipient -> botNumber null (commande historique)', async () => {
    const { b, orders } = makeBot();
    await b.processWebhook(inboundButton('pay:PD3431', 'm-bn5'));
    await b.processWebhook(inboundText('Awa Diop', 'm-bn6'));
    await b.processWebhook(inboundListReply('co:z:0:PD3431', 'm-bn7'));
    await b.processWebhook(inboundButton('co:w:PD3431', 'm-bn8'));
    assert.strictEqual(orders.length, 1);
    assert.strictEqual(orders[0].botNumber, null);
  });

  // Le checkout piloté au clavier (liste non passée côté D7) doit garder le numéro
  // lui aussi : c'est le chemin de repli le plus probable en vrai.
  await test('checkout tapé au clavier depuis le démo -> botNumber conservé', async () => {
    const { b, orders } = makeBot();
    const DEMO = '15554677146';
    await b.processWebhook(inboundButton('pay:PD3431', 'm-bn9', '221771112233', DEMO));
    await b.processWebhook(inboundText('Awa Diop', 'm-bn10', '221771112233', DEMO));
    await b.processWebhook(inboundText('Sacré-Cœur 3, villa 45', 'm-bn11', '221771112233', DEMO));
    await b.processWebhook(inboundText('wave', 'm-bn12', '221771112233', DEMO));
    assert.strictEqual(orders.length, 1);
    assert.strictEqual(orders[0].botNumber, DEMO);
  });

  // Sans client Supabase (cas des tests / config absente), la lecture ne doit ni
  // jeter ni bloquer la notification : null -> repli sur WHATSAPP_BOT_NUMBER.
  await test('resolveOrderBotNumber sans Supabase -> null (pas de crash)', async () => {
    assert.strictEqual(await bot.resolveOrderBotNumber('ord-1'), null);
    assert.strictEqual(await bot.resolveOrderBotNumber(null), null);
  });

  // --- Test mode : visibilité du catalogue démo (migration 009) --------------
  // Filtre à sens unique : le numéro démo voit tout (y compris de vrais produits,
  // c'est ce qui rend la démo crédible) ; le numéro de prod ne voit JAMAIS un
  // produit démo, donc un vrai client ne peut pas commander un décor.
  function makeDemoAwareBot() {
    const seen = [];
    const findProductSpy = async (code, options) => {
      seen.push({ code, options });
      return code === 'PD3431' ? FAKE : null;
    };
    return { ...makeBot({ findProduct: findProductSpy }), seen };
  }

  await test('numéro démo -> le catalogue démo est visible (allowDemo true)', async () => {
    const { b, seen } = makeDemoAwareBot();
    await b.processWebhook(inboundText('PD3431', 'm-cat1', '221771112233', '15554677146'));
    assert.ok(seen.length > 0, 'findProduct doit être appelé');
    assert.deepStrictEqual(seen[0].options, { allowDemo: true });
  });

  // CHANGEMENT DE COMPORTEMENT (WHATSAPP_DEMO_PRODUCT_PUBLIC, défaut true) :
  // le produit de démonstration est désormais accessible depuis le numéro de PROD,
  // pour qu'un testeur puisse dérouler le parcours sans numéro démo dédié.
  // La protection ne repose plus sur l'invisibilité du produit, mais sur deux
  // verrous en aval, testés juste en dessous :
  //   1. la fiche annonce la démonstration dès sa première ligne ;
  //   2. aucun lien de paiement réel n'est jamais émis (txtDemoStop).
  // Plus le verrou serveur : la commande est marquée is_demo -> hors payouts.
  await test('numéro prod -> le produit démo est accessible (allowDemo true)', async () => {
    const { b, seen } = makeDemoAwareBot();
    await b.processWebhook(inboundText('PD3431', 'm-cat2', '221771112233', '221768171175'));
    assert.deepStrictEqual(seen[0].options, { allowDemo: true });
  });

  await test('sans recipient -> le produit démo reste accessible (allowDemo true)', async () => {
    const { b, seen } = makeDemoAwareBot();
    await b.processWebhook(inboundText('PD3431', 'm-cat3'));
    assert.deepStrictEqual(seen[0].options, { allowDemo: true });
  });

  // Le contexte démo doit tenir sur TOUT le parcours, pas seulement au 1er message :
  // un bouton pressé plus tard ne doit pas faire disparaître le produit démo.
  await test('le contexte démo survit aux étapes suivantes (bouton)', async () => {
    const { b, seen } = makeDemoAwareBot();
    await b.processWebhook(inboundButton('pay:PD3431', 'm-cat4', '221771112233', '15554677146'));
    assert.ok(seen.every((s) => s.options.allowDemo === true), 'toutes les recherches doivent rester en contexte démo');
  });

  // --- Produit démo joué depuis la PROD : les deux verrous ------------------
  // Le produit étant désormais visible partout, la sécurité repose entièrement
  // sur ces garanties. Les prestataires de paiement tournent en `live` : un
  // testeur ne doit jamais pouvoir engager d'argent réel sur un produit de décor.
  const FAKE_DEMO = { ...FAKE, code: 'PD0000', nom: 'Caisse de yaourt (démonstration)', isDemo: true };

  function makeDemoProductBot() {
    let paymentCalls = 0;
    const made = makeBot({
      findProduct: async (code) => {
        if (code === 'PD0000') return FAKE_DEMO;
        return code === 'PD3431' ? FAKE : null;
      },
      initiatePayment: async () => { paymentCalls += 1; return { url: 'https://pay.test/abc' }; },
    });
    return { ...made, payments: () => paymentCalls };
  }

  await test('fiche démo -> bannière DÉMONSTRATION avant le nom du produit', async () => {
    const { b, rec } = makeDemoProductBot();
    await b.processWebhook(inboundText('PD0000'));
    const body = String(rec.sends[0].body);
    assert.ok(/DÉMONSTRATION/.test(body), 'la fiche doit annoncer la démonstration');
    assert.ok(body.indexOf('DÉMONSTRATION') < body.indexOf('Caisse'), 'la mention doit précéder le produit');
    assert.ok(!/Ce produit est bien enregistré/.test(body), 'la réassurance normale ne doit pas apparaître');
  });

  await test('fiche d\'un produit réel -> aucune mention de démonstration', async () => {
    const { b, rec } = makeDemoProductBot();
    await b.processWebhook(inboundText('PD3431'));
    const body = String(rec.sends[0].body);
    assert.ok(!/DÉMONSTRATION/.test(body));
    assert.ok(/Ce produit est bien enregistré/.test(body));
  });

  await test('checkout démo -> initiatePayment n\'est JAMAIS appelé', async () => {
    const { b, rec, payments } = makeDemoProductBot();
    await b.processWebhook(inboundButton('pay:PD0000'));
    await b.processWebhook(inboundText('Awa Diop'));
    await b.processWebhook(inboundListReply('co:z:2:PD0000'));
    await b.processWebhook(inboundButton('co:w:PD0000'));
    assert.strictEqual(payments(), 0, 'aucun paiement réel ne doit être initié sur un produit démo');
    const final = rec.sends[rec.sends.length - 1];
    assert.strictEqual(final.kind, 'text', 'pas de bouton de paiement en fin de parcours');
    assert.ok(/Fin de la démonstration/.test(final.body), final.body);
  });

  await test('parcours démo -> aucun message ne porte d\'URL', async () => {
    const { b, rec } = makeDemoProductBot();
    await b.processWebhook(inboundButton('pay:PD0000'));
    await b.processWebhook(inboundText('Awa Diop'));
    await b.processWebhook(inboundListReply('co:z:2:PD0000'));
    await b.processWebhook(inboundButton('co:w:PD0000'));
    assert.ok(rec.sends.every((s) => !s.url), 'aucun envoi du parcours démo ne doit porter d\'url');
  });

  await test('non-régression : un produit réel émet toujours son lien de paiement', async () => {
    const { b, rec, payments } = makeDemoProductBot();
    await b.processWebhook(inboundButton('pay:PD3431'));
    await b.processWebhook(inboundText('Awa Diop'));
    await b.processWebhook(inboundListReply('co:z:2:PD3431'));
    await b.processWebhook(inboundButton('co:w:PD3431'));
    assert.strictEqual(payments(), 1);
    const final = rec.sends[rec.sends.length - 1];
    assert.strictEqual(final.kind, 'cta');
    assert.strictEqual(final.url, 'https://pay.test/abc');
  });


  // --- Checkout conversationnel : nom + quartier + adresse + wallet dans le chat ---

  await test('checkout complet : nom -> quartier (liste) -> Wave -> lien de paiement', async () => {
    const { b, rec, orders } = makeBot();
    await b.processWebhook(inboundButton('pay:PD3431'));
    await b.processWebhook(inboundText('Awa Diop'));

    // Étape quartier : une liste, pas une question ouverte.
    const liste = rec.sends[1];
    assert.strictEqual(liste.kind, 'list');
    assert.ok(liste.rows.length <= 10, 'WhatsApp plafonne une liste à 10 lignes');
    assert.strictEqual(liste.rows[0].id, 'co:z:0:PD3431');
    assert.strictEqual(liste.rows[liste.rows.length - 1].id, 'co:z:autre:PD3431');
    assert.ok(liste.buttonLabel.length <= 20);
    assert.ok(liste.rows.every((r) => r.title.length <= 24), 'titre de ligne limité à 24 caractères');

    // Quartier connu -> on passe DIRECTEMENT au paiement : ni rue ni point de repère.
    // Le livreur appelle avant de livrer, et le numéro est déjà sur la commande.
    await b.processWebhook(inboundListReply('co:z:2:PD3431')); // Sacré-Cœur
    const wallets = rec.sends[2];
    assert.strictEqual(wallets.kind, 'buttons');
    assert.deepStrictEqual(wallets.buttons.map((x) => x.id), ['co:w:PD3431', 'co:o:PD3431']);
    // Les boutons ne peuvent pas porter d'image : l'emoji dans le titre est le seul repère.
    assert.ok(wallets.buttons.every((x) => x.title.length <= 20), 'titre de bouton limité à 20 caractères');
    assert.ok(/🐧/.test(wallets.buttons[0].title) && /Wave/.test(wallets.buttons[0].title));
    assert.ok(/🟠/.test(wallets.buttons[1].title) && /Orange Money/.test(wallets.buttons[1].title));
    // Seul visuel possible : la bannière des deux logos en en-tête du message.
    assert.strictEqual(wallets.headerImageUrl, 'https://www.validel.shop/images/wallets-wave-orange.png');

    await b.processWebhook(inboundButton('co:w:PD3431'));
    const final = rec.sends[3];
    assert.strictEqual(final.kind, 'cta');
    assert.strictEqual(final.url, 'https://pay.test/abc');
    assert.ok(final.displayText.length <= 20, 'display_text WhatsApp limité à 20 caractères');

    // Le téléphone n'est jamais demandé : il vient du compte WhatsApp émetteur.
    assert.strictEqual(orders.length, 1);
    assert.deepStrictEqual(
      { ...orders[0] },
      {
        productCode: 'PD3431',
        buyerName: 'Awa Diop',
        buyerPhone: '221771112233',
        deliveryAddress: 'Sacré-Cœur',
        quantity: 1,
        // Webhook de test sans `recipient` -> null : le serveur laissera la
        // colonne bot_number vide et les notifs retomberont sur le numéro par défaut.
        botNumber: null,
      },
    );
  });
  await test('checkout : « Autre quartier » -> adresse entièrement libre', async () => {
    const { b, rec, orders } = makeBot();
    await b.processWebhook(inboundButton('pay:PD3431'));
    await b.processWebhook(inboundText('Moussa Fall'));
    await b.processWebhook(inboundListReply('co:z:autre:PD3431'));
    await b.processWebhook(inboundText('Mbour, quartier Golf, face station'));
    await b.processWebhook(inboundText('wave'));
    assert.strictEqual(orders.length, 1);
    // Aucun quartier préfixé : l'acheteur a tout écrit lui-même.
    assert.strictEqual(orders[0].deliveryAddress, 'Mbour, quartier Golf, face station');
  });

  // Filet : si la liste ne passe pas côté D7, l'acheteur tape son adresse et ça marche.
  await test('checkout : adresse tapée au lieu de choisir dans la liste', async () => {
    const { b, rec, orders } = makeBot();
    await b.processWebhook(inboundButton('pay:PD3431'));
    await b.processWebhook(inboundText('Fatou Sow'));
    await b.processWebhook(inboundText('Pikine, rue 12, face école'));
    assert.strictEqual(rec.sends[2].kind, 'buttons', 'doit sauter directement au choix du wallet');
    await b.processWebhook(inboundText('orange'));
    assert.strictEqual(orders.length, 1);
    assert.strictEqual(orders[0].deliveryAddress, 'Pikine, rue 12, face école');
  });

  await test('checkout : « annuler » arrête le parcours et repropose les boutons', async () => {
    const { b, rec, orders } = makeBot();
    await b.processWebhook(inboundButton('pay:PD3431'));
    await b.processWebhook(inboundText('annuler'));
    assert.strictEqual(rec.sends[1].kind, 'buttons');
    assert.ok(/annul/i.test(rec.sends[1].body));
    assert.strictEqual(orders.length, 0, 'aucune commande ne doit être créée');
  });

  await test('checkout : nom trop court -> redemande sans avancer', async () => {
    const { b, rec } = makeBot();
    await b.processWebhook(inboundButton('pay:PD3431'));
    await b.processWebhook(inboundText('A'));
    assert.strictEqual(rec.sends[1].kind, 'text');
    assert.ok(/pr[ée]nom et nom/i.test(rec.sends[1].body));
    // L'étape n'a pas avancé : le message suivant est toujours interprété comme un nom.
    await b.processWebhook(inboundText('Awa Diop'));
    assert.strictEqual(rec.sends[2].kind, 'list');
  });

  await test('checkout : un nouveau code produit annule le parcours en cours', async () => {
    const { b, rec, orders } = makeBot();
    await b.processWebhook(inboundButton('pay:PD3431'));
    await b.processWebhook(inboundText('Awa Diop'));
    await b.processWebhook(inboundText('PD3431'));
    // Retour à la fiche produit, pas à l'étape quartier.
    assert.strictEqual(rec.sends[2].kind, 'buttons');
    assert.ok(/Caisse de Yaourt/.test(rec.sends[2].body));
    // Et le parcours repart de zéro : le message suivant redemande le nom.
    await b.processWebhook(inboundButton('pay:PD3431'));
    assert.ok(/pr[ée]nom et nom/i.test(rec.sends[3].body));
    assert.strictEqual(orders.length, 0);
  });

  // Règle centrale : ne JAMAIS laisser l'acheteur sans moyen de payer.
  await test('checkout : échec création commande -> repli sur le lien web', async () => {
    const { b, rec } = makeBot({
      createGuestOrder: async () => { throw new Error('guest/order indisponible'); },
    });
    await b.processWebhook(inboundButton('pay:PD3431'));
    await b.processWebhook(inboundText('Awa Diop'));
    await b.processWebhook(inboundText('Sacré-Cœur 3, villa 45'));
    await b.processWebhook(inboundButton('co:w:PD3431'));
    const final = rec.sends[3];
    assert.strictEqual(final.kind, 'cta');
    assert.strictEqual(final.url, 'https://www.validel.shop/product/PD3431');
  });

  await test('checkout : échec initiation paiement -> repli sur le lien web', async () => {
    const { b, rec } = makeBot({
      initiatePayment: async () => { throw new Error('pixpay indisponible'); },
    });
    await b.processWebhook(inboundButton('pay:PD3431'));
    await b.processWebhook(inboundText('Awa Diop'));
    await b.processWebhook(inboundText('Sacré-Cœur 3, villa 45'));
    await b.processWebhook(inboundText('wave'));
    assert.strictEqual(rec.sends[3].kind, 'cta');
    assert.strictEqual(rec.sends[3].url, 'https://www.validel.shop/product/PD3431');
  });

  // Bouton wallet reçu alors qu'aucun parcours n'est en cours (parcours expiré,
  // état perdu au redémarrage) : on ne bloque pas l'acheteur.
  await test('checkout : bouton wallet sans parcours actif -> lien web', async () => {
    const { b, rec, orders } = makeBot();
    await b.processWebhook(inboundButton('co:w:PD3431'));
    assert.strictEqual(rec.sends[0].kind, 'cta');
    assert.strictEqual(rec.sends[0].url, 'https://www.validel.shop/product/PD3431');
    assert.strictEqual(orders.length, 0);
  });

  await test('checkout : quartier choisi sans parcours actif -> lien web', async () => {
    const { b, rec } = makeBot();
    await b.processWebhook(inboundListReply('co:z:0:PD3431'));
    assert.strictEqual(rec.sends[0].kind, 'cta');
    assert.strictEqual(rec.sends[0].url, 'https://www.validel.shop/product/PD3431');
  });


  // --- Vérification de la bannière de paiement au démarrage ---------------
  // Une URL qui ne sert pas une vraie image fait échouer l'envoi WhatsApp avec
  // « Media upload error », et D7 ne le signale qu'en accusé de livraison : aucun
  // try/catch à l'envoi ne peut le rattraper. D'où le contrôle en amont.
  const fakeRes = (status, contentType) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? contentType : null) },
  });

  await test('bannière : image/png -> activée', async () => {
    const url = await bot.verifyWalletBanner(async () => fakeRes(200, 'image/png'));
    assert.strictEqual(url, 'https://www.validel.shop/images/wallets-wave-orange.png');
  });

  await test('bannière : image/jpeg -> activée', async () => {
    const url = await bot.verifyWalletBanner(async () => fakeRes(200, 'image/jpeg'));
    assert.ok(url, 'le JPEG est accepté par WhatsApp');
  });

  // Le cas réellement rencontré : le catch-all SPA renvoie index.html en 200.
  await test('bannière : 200 mais text/html (catch-all SPA) -> désactivée', async () => {
    const url = await bot.verifyWalletBanner(async () => fakeRes(200, 'text/html; charset=utf-8'));
    assert.strictEqual(url, null);
  });

  await test('bannière : 404 -> désactivée', async () => {
    const url = await bot.verifyWalletBanner(async () => fakeRes(404, 'text/plain'));
    assert.strictEqual(url, null);
  });

  await test('bannière : content-type absent -> désactivée', async () => {
    const url = await bot.verifyWalletBanner(async () => fakeRes(200, null));
    assert.strictEqual(url, null);
  });

  await test('bannière : URL injoignable -> désactivée, pas de crash', async () => {
    const url = await bot.verifyWalletBanner(async () => { throw new Error('ENOTFOUND'); });
    assert.strictEqual(url, null);
  });

  // Certains hébergeurs refusent HEAD : on doit retenter en GET avant de conclure.
  await test('bannière : HEAD refusé (405) -> retente en GET', async () => {
    const methods = [];
    const url = await bot.verifyWalletBanner(async (_u, opts) => {
      methods.push(opts.method);
      return opts.method === 'HEAD' ? fakeRes(405, 'text/plain') : fakeRes(200, 'image/png');
    });
    assert.deepStrictEqual(methods, ['HEAD', 'GET']);
    assert.ok(url, 'la bannière doit être activée après le repli GET');
  });

  // La vérification doit être rejouée pour que les tests suivants gardent la bannière.
  await bot.verifyWalletBanner(async () => fakeRes(200, 'image/png'));

  console.log(`\n${passed} réussis, ${failed} échoués`);
  process.exit(failed === 0 ? 0 : 1);
})();
