// backend/whatsapp-bot.js
// Bot WhatsApp conversationnel Validèl (via D7).
//
// Parcours : l'acheteur envoie un code produit (ex. PD3431) sur WhatsApp -> le bot
// répond avec la fiche produit + boutons -> "Payer en sécurité" renvoie le lien
// /product/{code} existant (paiement Wave/OM via Pixpay). Aucune app à installer.
//
// RÈGLE CENTRALE : un message entrant ne modifie JAMAIS un statut de transaction.
// WhatsApp est un canal de lecture/notification. La vérité vient de Pixpay (webhook)
// et de l'app livreur. Ce module ne fait AUCUNE écriture de statut de commande/paiement.
//
// Sécurité : D7 ne signe pas ses webhooks -> l'endpoint est protégé par un token
// secret imprévisible dans l'URL (WHATSAPP_WEBHOOK_SECRET), comparé à temps constant.

const crypto = require('crypto');
const { supabase } = require('./supabase');
const {
  sendWhatsApp,
  sendWhatsAppButtons,
  sendWhatsAppCtaUrl,
} = require('./direct7');

const WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET || '';
const PUBLIC_WEB_BASE_URL = String(process.env.PUBLIC_WEB_BASE_URL || 'https://www.validel.shop').replace(/\/+$/, '');
const COMMISSION_PCT = (() => {
  const n = Number(process.env.VALIDEL_COMMISSION_PCT);
  return Number.isFinite(n) && n >= 0 ? n : 3;
})();

// Mode test : n'appelle PAS D7, affiche dans les logs ce que le bot AURAIT envoyé.
// Permet de tester tout le parcours en local sans numéro WhatsApp ni compte D7.
const DRY_RUN = /^true$/i.test(process.env.WHATSAPP_BOT_DRY_RUN || '');

// Regex tolérante : « bonjour PD3431 svp » -> PD3431. Insensible à la casse.
const PRODUCT_CODE_RE = /\b(PD\d{3,})\b/i;

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function extractProductCode(text) {
  const m = PRODUCT_CODE_RE.exec(String(text || ''));
  return m ? m[1].toUpperCase() : null;
}

function computeFees(price) {
  const p = Number(price) || 0;
  const frais = Math.round((p * COMMISSION_PCT) / 100);
  return { prix: p, frais, total: p + frais };
}

function formatFcfa(n) {
  return Number(n || 0).toLocaleString('fr-FR').replace(/ /g, ' ');
}

function paymentLink(code) {
  return `${PUBLIC_WEB_BASE_URL}/product/${encodeURIComponent(code)}`;
}

// ---------------------------------------------------------------------------
// Parsing du webhook entrant D7
// ---------------------------------------------------------------------------
// Payload D7 (message entrant) :
//   { event: {...}, event_content: { message: { msg_id, originator, message_type,
//     text: { body }, ... } } }
// Les accusés (DLR : read/delivered) n'ont pas de event_content.message -> on ignore.
function parseD7Message(body) {
  const message = body && body.event_content && body.event_content.message;
  if (!message || !message.msg_id) return null;
  const type = String(message.message_type || '').toUpperCase();
  return {
    msgId: message.msg_id,
    from: message.originator,
    type,
    text: (message.text && message.text.body) || '',
    buttonId: extractButtonId(message),
    raw: message,
  };
}

// ⚠️ À CONFIRMER sur un vrai payload D7 : la structure exacte d'une réponse de bouton
// interactif n'est pas entièrement documentée. On teste plusieurs chemins connus.
function extractButtonId(message) {
  const i = message && message.interactive;
  return (
    (i && i.button_reply && i.button_reply.id) ||
    (i && i.list_reply && i.list_reply.id) ||
    (i && i.reply && i.reply.id) ||
    (i && i.id) ||
    (message && message.button && message.button.id) ||
    null
  );
}

// ---------------------------------------------------------------------------
// Accès données (Supabase) — lecture seule
// ---------------------------------------------------------------------------
async function trouverProduit(code) {
  if (!supabase || !code) return null;
  const { data: product, error } = await supabase
    .from('products')
    .select('id, name, price, code, is_available, vendor_id')
    .ilike('code', code)
    .maybeSingle();
  if (error) {
    console.error('[WABOT] trouverProduit erreur:', error.message);
    return null;
  }
  if (!product || product.is_available === false) return null;

  let vendeurNom = 'Vendeur';
  let vendeurQuartier = '';
  if (product.vendor_id) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('company_name, full_name, address')
      .eq('id', product.vendor_id)
      .maybeSingle();
    if (prof) {
      vendeurNom = prof.company_name || prof.full_name || vendeurNom;
      vendeurQuartier = prof.address || '';
    }
  }
  return {
    code: product.code,
    nom: product.name,
    prix: Number(product.price) || 0,
    vendeurNom,
    vendeurQuartier,
  };
}

// ---------------------------------------------------------------------------
// Contenu des messages
// ---------------------------------------------------------------------------
function ficheProduitText(produit) {
  const { prix, frais, total } = computeFees(produit.prix);
  const ligneVendeur = produit.vendeurQuartier
    ? `Vendeur : *${produit.vendeurNom}* — ${produit.vendeurQuartier}`
    : `Vendeur : *${produit.vendeurNom}*`;
  return [
    `📦 *${produit.nom}*`,
    `Prix : *${formatFcfa(prix)} FCFA*`,
    ligneVendeur,
    `Code : ${produit.code}`,
    '',
    '✅ Ce produit est bien enregistré sur Validèl.',
    '',
    `Frais Validèl : ${formatFcfa(frais)} FCFA`,
    `*Total à payer : ${formatFcfa(total)} FCFA*`,
    '',
    'Votre argent est protégé : le vendeur n\'est payé qu\'après votre confirmation de réception.',
  ].join('\n').slice(0, 1024);
}

function paiementCtaText(produit) {
  const { total } = computeFees(produit.prix);
  return [
    `🔒 *Paiement protégé — ${formatFcfa(total)} FCFA*`,
    'Payez avec Wave ou Orange Money. Aucun compte à créer.',
    '',
    '⚠️ Validèl ne demandera jamais votre code secret Wave ou Orange Money.',
  ].join('\n');
}

const TXT_CODE_INTROUVABLE = (code) =>
  `⚠️ Le code ${code} n'existe pas sur Validèl.\nNe payez pas ce vendeur tant que le produit n'est pas enregistré.`;

const TXT_AUCUN_CODE =
  'Envoyez le code produit reçu du vendeur (ex : PD3431) pour commencer.';

const TXT_FAQ_MARCHE = [
  '*Comment Validèl protège votre achat*',
  '1️⃣ Vous payez avec Wave ou Orange Money.',
  '2️⃣ Votre argent est protégé — ni vous ni le vendeur ne pouvez y toucher.',
  '3️⃣ Le vendeur livre, en sachant que l\'argent est là.',
  '4️⃣ Vous vérifiez votre produit et confirmez la réception.',
  '5️⃣ Le vendeur est payé.',
  '',
  'Rien n\'est versé au vendeur avant votre confirmation.',
].join('\n');

function txtFaqFrais(produit) {
  if (!produit) {
    return [
      '*Les frais*',
      `Validèl prélève ${COMMISSION_PCT} % sur la transaction, affichés avant toute confirmation. Aucun frais caché.`,
      'Le vendeur ne paie rien.',
    ].join('\n');
  }
  const { frais, total } = computeFees(produit.prix);
  return [
    '*Les frais*',
    `Validèl prélève ${COMMISSION_PCT} % sur la transaction, soit ${formatFcfa(frais)} FCFA pour cette commande.`,
    `Total à payer : *${formatFcfa(total)} FCFA*, affiché avant toute confirmation. Aucun frais caché.`,
    'Le vendeur ne paie rien.',
  ].join('\n');
}

const TXT_FAQ_PROBLEME = [
  '*En cas de problème*',
  'Tant que vous n\'avez pas confirmé la réception, votre argent reste protégé.',
  'Si le produit n\'arrive pas, ou s\'il ne correspond pas : *ne confirmez pas la réception* et écrivez-nous ici.',
  'Nous examinons les preuves des deux côtés et tranchons. Si le litige est en votre faveur, vous êtes remboursé sur le compte Wave ou Orange Money qui a payé.',
].join('\n');

// Boutons réutilisés
const btnPayer = (code) => ({ id: `pay:${code}`, title: 'Payer en sécurité' });
const btnAutresQuestions = (code) => ({ id: `faq:${code}`, title: 'Autres questions' });

// ---------------------------------------------------------------------------
// Décision : quelles réponses envoyer ? (fonction pure et testable)
// Retourne une liste d'actions : {kind:'text'|'buttons'|'cta', ...}
// ---------------------------------------------------------------------------
async function decideReplies(parsed, deps) {
  const findProduct = (deps && deps.findProduct) || trouverProduit;

  // 1) Réponse à un bouton interactif
  if (parsed.buttonId) {
    const parts = String(parsed.buttonId).split(':');
    const kindId = parts[0];

    if (kindId === 'pay') {
      const code = parts[1];
      const produit = await findProduct(code);
      if (!produit) return [{ kind: 'text', body: TXT_CODE_INTROUVABLE(code) }];
      return [{
        kind: 'cta',
        body: paiementCtaText(produit),
        displayText: 'Payer maintenant',
        url: paymentLink(code),
      }];
    }

    if (kindId === 'faq') {
      // faq:CODE -> menu ; faq:SUJET:CODE -> réponse
      if (parts.length === 2) {
        const code = parts[1];
        return [{
          kind: 'buttons',
          body: 'Que souhaitez-vous savoir ?',
          buttons: [
            { id: `faq:marche:${code}`, title: 'Comment ça marche' },
            { id: `faq:frais:${code}`, title: 'Les frais' },
            { id: `faq:probleme:${code}`, title: 'En cas de problème' },
          ],
        }];
      }
      const sujet = parts[1];
      const code = parts[2];
      const produit = sujet === 'frais' ? await findProduct(code) : null;
      let body;
      if (sujet === 'marche') body = TXT_FAQ_MARCHE;
      else if (sujet === 'frais') body = txtFaqFrais(produit);
      else if (sujet === 'probleme') body = TXT_FAQ_PROBLEME;
      else body = TXT_AUCUN_CODE;
      // Chaque réponse FAQ se termine en reproposant « Payer en sécurité » ET
      // « Autres questions » pour ne jamais laisser le client dans une impasse.
      return [{ kind: 'buttons', body, buttons: [btnPayer(code), btnAutresQuestions(code)] }];
    }
    // Bouton inconnu -> invite neutre
    return [{ kind: 'text', body: TXT_AUCUN_CODE }];
  }

  // 2) Message texte
  const code = extractProductCode(parsed.text);
  if (!code) {
    // Note : « j'ai payé », « bonjour », etc. tombent ici. On NE change aucun statut,
    // on invite simplement à envoyer un code. (Règle centrale respectée.)
    return [{ kind: 'text', body: TXT_AUCUN_CODE }];
  }
  const produit = await findProduct(code);
  if (!produit) return [{ kind: 'text', body: TXT_CODE_INTROUVABLE(code) }];
  return [{
    kind: 'buttons',
    body: ficheProduitText(produit),
    buttons: [btnPayer(produit.code), btnAutresQuestions(produit.code)],
  }];
}

// ---------------------------------------------------------------------------
// Déduplication par msg_id (persistance Supabase, TTL 24 h)
// ---------------------------------------------------------------------------
const memProcessed = new Map(); // secours UNIQUEMENT si Supabase indisponible (non fiable multi-instance)
const MEM_TTL_MS = 24 * 60 * 60 * 1000;

async function defaultIsDuplicate(msgId) {
  if (!msgId) return false;
  if (supabase) {
    try {
      const { error } = await supabase
        .from('whatsapp_processed_messages')
        .insert({ msg_id: msgId });
      if (!error) return false;                 // insertion OK -> première fois
      if (error.code === '23505') return true;  // violation d'unicité -> déjà traité
      // Table absente (42P01) ou autre -> on bascule sur le secours mémoire.
      console.warn('[WABOT] dédup Supabase indisponible, secours mémoire:', error.code, error.message);
    } catch (e) {
      console.warn('[WABOT] dédup Supabase exception, secours mémoire:', e && e.message);
    }
  }
  const now = Date.now();
  for (const [k, t] of memProcessed) if (now - t > MEM_TTL_MS) memProcessed.delete(k);
  if (memProcessed.has(msgId)) return true;
  memProcessed.set(msgId, now);
  return false;
}

// ---------------------------------------------------------------------------
// Exécution des actions -> envoi via D7
// ---------------------------------------------------------------------------
// Loggers utilisés en DRY_RUN (aucun appel réseau).
async function dryText(to, body) {
  console.log(`\n[WABOT][DRY] -> ${to} (texte):\n${body}\n`);
}
async function dryButtons(to, body, buttons) {
  const b = (buttons || []).map((x) => `[${x.title} | ${x.id}]`).join('  ');
  console.log(`\n[WABOT][DRY] -> ${to} (boutons):\n${body}\n  boutons: ${b}\n`);
}
async function dryCta(to, body, displayText, url) {
  console.log(`\n[WABOT][DRY] -> ${to} (cta):\n${body}\n  bouton: [${displayText}] -> ${url}\n`);
}

async function executeAction(action, to, senders) {
  const s = senders || {};
  const sendText = s.sendText || (DRY_RUN ? dryText : sendWhatsApp);
  const sendButtons = s.sendButtons || (DRY_RUN ? dryButtons : sendWhatsAppButtons);
  const sendCta = s.sendCtaUrl || (DRY_RUN ? dryCta : sendWhatsAppCtaUrl);
  if (action.kind === 'text') return sendText(to, action.body);
  if (action.kind === 'buttons') return sendButtons(to, action.body, action.buttons);
  if (action.kind === 'cta') return sendCta(to, action.body, action.displayText, action.url);
  return null;
}

// ---------------------------------------------------------------------------
// Fabrique du bot (injection de dépendances pour les tests)
// ---------------------------------------------------------------------------
function createBot(deps = {}) {
  const findProduct = deps.findProduct || trouverProduit;
  const isDuplicate = deps.isDuplicate || defaultIsDuplicate;
  const senders = {
    sendText: deps.sendText,
    sendButtons: deps.sendButtons,
    sendCtaUrl: deps.sendCtaUrl,
  };

  async function processWebhook(body) {
    const parsed = parseD7Message(body);
    if (!parsed) return; // DLR / statut / payload sans message -> rien à faire
    if (await isDuplicate(parsed.msgId)) {
      console.log('[WABOT] message déjà traité, ignoré:', parsed.msgId);
      return;
    }
    if (!parsed.from) {
      console.warn('[WABOT] message sans expéditeur, ignoré:', parsed.msgId);
      return;
    }
    const actions = await decideReplies(parsed, { findProduct });
    for (const action of actions) {
      await executeAction(action, parsed.from, senders);
    }
  }

  function handler(req, res) {
    // Sécurité : token secret dans l'URL (D7 ne signe pas ses webhooks).
    if (!WEBHOOK_SECRET || !safeEqual(req.params.secret || '', WEBHOOK_SECRET)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    // Acquitter 200 AVANT de traiter (D7/Meta réessaient si la réponse tarde).
    res.status(200).json({ received: true });
    const body = req.body;
    setImmediate(() => {
      processWebhook(body).catch((err) => console.error('[WABOT] processWebhook error:', err));
    });
  }

  return { handler, processWebhook };
}

function registerWhatsAppBot(app, deps) {
  const bot = createBot(deps);
  app.post('/api/whatsapp/webhook/:secret', bot.handler);
  console.log('[WABOT] Bot WhatsApp monté sur POST /api/whatsapp/webhook/:secret',
    WEBHOOK_SECRET ? '(secret configuré)' : '(⚠️ WHATSAPP_WEBHOOK_SECRET manquant -> 401 sur toutes les requêtes)',
    DRY_RUN ? '[DRY_RUN: aucun envoi D7, logs seulement]' : '');
  return bot;
}

module.exports = {
  registerWhatsAppBot,
  createBot,
  // exportés pour les tests
  parseD7Message,
  extractProductCode,
  extractButtonId,
  decideReplies,
  defaultIsDuplicate,
  computeFees,
  ficheProduitText,
  paiementCtaText,
  safeEqual,
  trouverProduit,
  paymentLink,
};
