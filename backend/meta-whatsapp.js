// backend/meta-whatsapp.js
// Transporteur WhatsApp Cloud API (Meta) — réservé au numéro DÉMO.
//
// ⚠️ Ne remplace PAS Direct7. La prod (221768171175) continue de passer par
// backend/direct7.js : ce module n'y touche pas, ne l'importe pas, et n'est
// monté que si META_* est configuré. Les deux transporteurs coexistent, chacun
// avec sa route webhook et sa propre instance de bot.
//
// Le cerveau du bot (decideReplies) est transporteur-agnostique : il renvoie des
// descripteurs {kind:'text'|'buttons'|'cta'|'list'}, et executeAction les passe
// aux senders injectés. Il suffit donc de fournir 4 fonctions à la MÊME signature
// que celles de direct7.js pour faire vivre le parcours complet sur Meta :
//   sendText(phone, body, from)
//   sendButtons(phone, body, buttons, from, { headerImageUrl })
//   sendCtaUrl(phone, body, displayText, url, from)
//   sendList(phone, body, buttonLabel, rows, from)
//
// Bonne surprise : D7 proxifie le format Meta. Les objets `interactive` sont
// identiques des deux côtés — seule l'enveloppe change (D7 : {originator,
// recipients, content} ; Meta : {messaging_product, to, type}).

const axios = require('axios');
const crypto = require('crypto');

const GRAPH_BASE = process.env.META_GRAPH_BASE || 'https://graph.facebook.com';
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';

// Alias historiques : la console Meta et la plupart des tutoriels nomment ces
// variables WHATSAPP_*. On accepte les deux graphies pour ne pas imposer un
// renommage sur Render. META_* gagne quand les deux sont definies.
//
// EXCEPTION VOLONTAIRE : META_WEBHOOK_SECRET n'a PAS d'alias vers
// WHATSAPP_WEBHOOK_SECRET, qui est deja le secret d'URL du webhook D7. Les
// partager ferait qu'un secret valide pour la prod ouvrirait aussi la route
// demo — les deux routes doivent avoir des secrets distincts.
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || '';
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const APP_SECRET = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET || '';
const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.WEBHOOK_VERIFY_TOKEN || '';
const WEBHOOK_SECRET = process.env.META_WEBHOOK_SECRET || '';
// Miroir de WHATSAPP_BOT_DRY_RUN côté D7 : logue au lieu d'envoyer.
const DRY_RUN = /^true$/i.test(process.env.META_DRY_RUN || '');

function digits(v) {
  return String(v == null ? '' : v).replace(/\D/g, '');
}

// Numéro business Meta (international sans +). Sert au routage démo via
// isDemoBotNumber() et de garde-fou anti-mélange avec la prod D7.
const BOT_NUMBER = digits(process.env.META_BOT_NUMBER || process.env.WHATSAPP_DEMO_NUMBER || '');

// Le module ne se monte que s'il est complètement configuré : mieux vaut ne pas
// exposer de route webhook du tout que d'en exposer une qui plante.
function isConfigured() {
  return Boolean(ACCESS_TOKEN && PHONE_NUMBER_ID && BOT_NUMBER);
}

// Diagnostic de demarrage : nommer PRECISEMENT ce qui manque. Un « non monte »
// generique fait perdre un cycle de deploiement a chaque variable oubliee.
function missingConfig() {
  const missing = [];
  if (!ACCESS_TOKEN) missing.push('META_ACCESS_TOKEN (ou WHATSAPP_ACCESS_TOKEN)');
  if (!PHONE_NUMBER_ID) missing.push('META_PHONE_NUMBER_ID (ou WHATSAPP_PHONE_NUMBER_ID)');
  if (!BOT_NUMBER) missing.push('META_BOT_NUMBER (numero demo, international sans +)');
  return missing;
}

// Variables non bloquantes au montage, mais qui cassent le webhook a l'usage.
function warnings() {
  const w = [];
  if (!APP_SECRET) w.push('META_APP_SECRET manquant -> TOUS les POST entrants seront rejetes (401).');
  if (!VERIFY_TOKEN) w.push('META_WEBHOOK_VERIFY_TOKEN manquant -> Meta ne pourra pas valider l\'abonnement (403 sur le challenge).');
  if (!WEBHOOK_SECRET) w.push('META_WEBHOOK_SECRET manquant -> toutes les requetes seront rejetees (401).');
  const { isDemoBotNumber } = require('./demo');
  if (BOT_NUMBER && !isDemoBotNumber(BOT_NUMBER)) {
    w.push(`${BOT_NUMBER} absent de WHATSAPP_DEMO_BOT_NUMBERS -> le catalogue demo restera INVISIBLE et les commandes ne seront PAS marquees is_demo.`);
  }
  return w;
}

// `from` = numéro business qui doit émettre (posé par executeAction à partir de
// parsed.to). Meta n'adresse pas un numéro mais un phone_number_id, d'où cette
// résolution. Le refus explicite sur un `from` étranger est VOLONTAIRE : c'est
// ce qui garantit qu'un message prod ne peut jamais partir par Meta, même en
// cas d'erreur de câblage.
function resolvePhoneNumberId(from) {
  const wanted = digits(from);
  if (wanted && BOT_NUMBER && wanted !== BOT_NUMBER) {
    throw new Error(
      `[META] refus d'emettre depuis ${wanted} : ce transporteur ne sert que ${BOT_NUMBER} `
      + '(un envoi prod ne doit jamais passer par Meta).'
    );
  }
  return PHONE_NUMBER_ID;
}

function envelope(phone, extra) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: digits(phone),
    ...extra,
  };
}

async function postMeta(payload, from) {
  const id = resolvePhoneNumberId(from);
  if (DRY_RUN) {
    console.log('[META][DRY_RUN] envoi simule:', JSON.stringify(payload));
    return { success: true, dryRun: true };
  }
  if (!ACCESS_TOKEN) throw new Error('META_ACCESS_TOKEN non configure');
  if (!id) throw new Error('META_PHONE_NUMBER_ID non configure');
  try {
    const response = await axios.post(
      `${GRAPH_BASE}/${GRAPH_VERSION}/${id}/messages`,
      payload,
      {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        timeout: 15000,
      }
    );
    console.log('[META] WhatsApp envoye:', JSON.stringify(response.data));
    return { success: true, data: response.data };
  } catch (error) {
    // Meta loge le vrai motif dans error.code/message (ex. 131037 display name
    // non approuve). Sans ca un rejet reste invisible : l'appel echoue en 400
    // sans indice exploitable.
    const err = error && error.response && error.response.data && error.response.data.error;
    const detail = err
      ? `#${err.code} ${err.message}${err.error_data && err.error_data.details ? ` — ${err.error_data.details}` : ''}`
      : (error && error.message) || 'erreur inconnue';
    console.error('[META] Erreur envoi WhatsApp:', err || (error && error.message) || error);
    const wrapped = new Error(detail);
    if (err && err.code != null) wrapped.metaCode = Number(err.code);
    throw wrapped;
  }
}

// --- Les 4 senders (signatures alignees sur direct7.js) --------------------

async function sendText(phone, message, from) {
  return postMeta(envelope(phone, {
    type: 'text',
    text: { preview_url: false, body: String(message == null ? '' : message) },
  }), from);
}

// buttons = [{ id, title }] — 3 max, titre 20 caracteres (contraintes WhatsApp,
// identiques a celles deja appliquees cote D7).
async function sendButtons(phone, bodyText, buttons, from, options = {}) {
  const safeButtons = (Array.isArray(buttons) ? buttons : []).slice(0, 3).map((b) => ({
    type: 'reply',
    reply: {
      id: String((b && b.id) || '').slice(0, 256),
      title: String((b && b.title) || '').slice(0, 20),
    },
  }));

  const build = (withHeader) => {
    const interactive = {
      type: 'button',
      body: { text: String(bodyText || '').slice(0, 1024) },
      action: { buttons: safeButtons },
    };
    if (withHeader) {
      interactive.header = { type: 'image', image: { link: String(options.headerImageUrl) } };
    }
    return envelope(phone, { type: 'interactive', interactive });
  };

  if (!options.headerImageUrl) return postMeta(build(false), from);
  try {
    return await postMeta(build(true), from);
  } catch (e) {
    // Meme repli que cote D7 : une banniere refusee ne doit jamais priver
    // l'acheteur de ses boutons de paiement.
    console.warn('[META] En-tete image refuse, renvoi sans image:', e && e.message);
    return postMeta(build(false), from);
  }
}

async function sendCtaUrl(phone, bodyText, displayText, url, from) {
  return postMeta(envelope(phone, {
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: { text: String(bodyText || '').slice(0, 1024) },
      action: {
        name: 'cta_url',
        parameters: {
          display_text: String(displayText || '').slice(0, 20),
          url: String(url || ''),
        },
      },
    },
  }), from);
}

// 10 lignes MAX toutes sections confondues, titre 24, description 72, bouton 20.
async function sendList(phone, bodyText, buttonLabel, rows, from) {
  const safeRows = (Array.isArray(rows) ? rows : []).slice(0, 10).map((r) => {
    const row = {
      id: String((r && r.id) || '').slice(0, 200),
      title: String((r && r.title) || '').slice(0, 24),
    };
    if (r && r.description) row.description = String(r.description).slice(0, 72);
    return row;
  });
  const label = String(buttonLabel || 'Choisir').slice(0, 20);
  return postMeta(envelope(phone, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: String(bodyText || '').slice(0, 1024) },
      action: {
        button: label,
        sections: [{ title: label.slice(0, 24), rows: safeRows }],
      },
    },
  }), from);
}

// --- Webhook entrant --------------------------------------------------------

function extractValue(body) {
  return body
    && Array.isArray(body.entry) && body.entry[0]
    && Array.isArray(body.entry[0].changes) && body.entry[0].changes[0]
    && body.entry[0].changes[0].value;
}

// Normalise un payload Meta vers la forme EXACTE que renvoie parseD7Message,
// pour que decideReplies n'ait aucune idee du transporteur utilise :
//   { msgId, from, to, type, text, buttonId, raw }
//
// `to` vient de metadata.display_phone_number (le vrai numero, pas l'id opaque) :
// c'est lui qui alimente isDemoBotNumber() et fige orders.bot_number.
function parseMetaMessage(body) {
  const value = extractValue(body);
  const message = value && Array.isArray(value.messages) && value.messages[0];
  if (!message || !message.id) return null;
  const i = message.interactive;
  return {
    msgId: message.id,
    from: digits(message.from),
    to: digits((value.metadata && value.metadata.display_phone_number) || '') || BOT_NUMBER || null,
    type: String(message.type || '').toUpperCase(),
    text: (message.text && message.text.body) || '',
    buttonId:
      (i && i.button_reply && i.button_reply.id)
      || (i && i.list_reply && i.list_reply.id)
      // Reponse rapide d'un template : Meta la place dans message.button.payload.
      || (message.button && (message.button.payload || message.button.text))
      || null,
    raw: message,
  };
}

// Statuts Meta (sent/delivered/read/failed). Meme forme de retour que
// parseD7StatusEvent pour rester interchangeable, mais on ne branche AUCUN
// fallback SMS dessus : le SMS de secours est indexe sur les request_id D7 et
// n'a de toute facon pas de sens sur une demo (cf. registerMetaWhatsAppBot).
function parseMetaStatusEvent(body) {
  const value = extractValue(body);
  const status = value && Array.isArray(value.statuses) && value.statuses[0];
  if (!status || !status.id) return null;
  const err = Array.isArray(status.errors) && status.errors[0];
  return {
    requestId: status.id,
    msgId: status.id,
    status: String(status.status || '').toLowerCase(),
    recipient: digits(status.recipient_id || ''),
    reason: err ? `#${err.code} ${err.title || err.message || ''}`.trim() : null,
  };
}

// Meta signe chaque webhook en HMAC-SHA256 du corps BRUT avec l'app secret.
// req.rawBody est deja capture globalement par express.json({verify}) dans
// server.js — indispensable : le corps re-serialise ne redonne pas la meme
// signature.
function verifySignature(rawBody, signatureHeader) {
  if (!APP_SECRET) return false;
  const received = String(signatureHeader || '');
  if (!received.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', APP_SECRET)
    .update(Buffer.from(String(rawBody || ''), 'utf8'))
    .digest('hex');
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Monte le bot DEMO sur ses propres routes. N'appelle jamais registerWhatsAppBot :
// la route D7 (/api/whatsapp/webhook/:secret) reste strictement inchangee.
function registerMetaWhatsAppBot(app, deps = {}) {
  const missing = missingConfig();
  if (missing.length) {
    console.log('[META] Bot demo NON MONTE. Variables manquantes :');
    missing.forEach((m) => console.log(`       - ${m}`));
    return null;
  }
  const { createBot } = require('./whatsapp-bot');
  const bot = createBot({
    // Transporteur Meta au lieu de D7 — c'est TOUT ce qui change.
    sendText,
    sendButtons,
    sendCtaUrl,
    sendList,
    // Parsers Meta (injection ajoutee dans createBot ; defaut = parsers D7).
    parseMessage: parseMetaMessage,
    parseStatusEvent: parseMetaStatusEvent,
    // Pas de fallback SMS sur la demo : on se contente de tracer les echecs,
    // ce qui rend un rejet Meta (#131037 & co) visible dans les logs Render.
    sendFallbackSmsNow: async (requestId, status, reason) => {
      console.warn('[META][DEMO] message non remis:', { requestId, status, reason });
    },
    markDeliveryNotificationRead: async () => {},
    skipBannerCheck: true,
    ...deps,
  });

  // Verification d'abonnement Meta : GET avec hub.challenge a renvoyer en clair.
  app.get('/api/whatsapp/webhook/meta/:secret', (req, res) => {
    if (!WEBHOOK_SECRET || !safeEqual(req.params.secret || '', WEBHOOK_SECRET)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && VERIFY_TOKEN && safeEqual(token || '', VERIFY_TOKEN)) {
      console.log('[META] Webhook verifie par Meta.');
      return res.status(200).type('text/plain').send(String(challenge || ''));
    }
    return res.status(403).json({ error: 'verify_token_mismatch' });
  });

  app.post('/api/whatsapp/webhook/meta/:secret', (req, res) => {
    // Double barriere : secret d'URL (comme D7) ET signature Meta.
    if (!WEBHOOK_SECRET || !safeEqual(req.params.secret || '', WEBHOOK_SECRET)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    if (!verifySignature(req.rawBody, req.get('x-hub-signature-256'))) {
      console.warn('[META] Signature X-Hub-Signature-256 invalide, webhook rejete.');
      return res.status(401).json({ error: 'bad_signature' });
    }
    // Acquitter 200 AVANT de traiter : Meta reessaie si la reponse tarde.
    res.status(200).json({ received: true });
    const body = req.body;
    setImmediate(() => {
      bot.processWebhook(body).catch((err) => console.error('[META] processWebhook error:', err));
    });
  });

  console.log(
    `[META] Bot DEMO monte sur /api/whatsapp/webhook/meta/:secret — numero ${BOT_NUMBER}, `
    + `phone_number_id ${PHONE_NUMBER_ID}, ${GRAPH_VERSION}`
    + (DRY_RUN ? ' [DRY_RUN: aucun envoi reel]' : '')
  );
  warnings().forEach((w) => console.warn(`[META] !! ${w}`));
  return bot;
}

module.exports = {
  registerMetaWhatsAppBot,
  isConfigured,
  missingConfig,
  warnings,
  BOT_NUMBER,
  // senders (exportes pour le script d'envoi reel et les tests)
  sendText,
  sendButtons,
  sendCtaUrl,
  sendList,
  // exportes pour les tests
  parseMetaMessage,
  parseMetaStatusEvent,
  verifySignature,
  resolvePhoneNumberId,
};
