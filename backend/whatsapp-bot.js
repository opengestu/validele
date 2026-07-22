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
const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('./supabase');
const {
  sendWhatsApp,
  sendWhatsAppButtons,
  sendWhatsAppCtaUrl,
  sendWhatsAppTemplate,
} = require('./direct7');

// Template Meta approuvé pour la notification "en cours de livraison". Si le nom
// est défini, on l'utilise (livraison fiable hors fenêtre 24h) ; sinon repli sur
// le message libre (ne part que si le client a écrit dans les 24h).
const DELIVERY_TEMPLATE_NAME = String(process.env.WHATSAPP_TEMPLATE_DELIVERY_NAME || '').trim();
const DELIVERY_TEMPLATE_LANG = String(process.env.WHATSAPP_TEMPLATE_DELIVERY_LANG || 'fr').trim();

const WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET || '';
const PUBLIC_WEB_BASE_URL = String(process.env.PUBLIC_WEB_BASE_URL || 'https://www.validel.shop').replace(/\/+$/, '');
// Frais de protection acheteur (SANS rapport avec la commission vendeur, gérée
// séparément par un admin au moment du payout). Défaut 0 = pas de frais surprise
// si la variable n'est pas réglée ; réglable à tout moment via Render, lu en
// temps réel par la page de paiement web (voir GET /api/config/protection-fee).
const COMMISSION_PCT = (() => {
  const n = Number(process.env.VALIDEL_COMMISSION_PCT);
  return Number.isFinite(n) && n >= 0 ? n : 0;
})();

// Mode test : n'appelle PAS D7, affiche dans les logs ce que le bot AURAIT envoyé.
// Permet de tester tout le parcours en local sans numéro WhatsApp ni compte D7.
const DRY_RUN = /^true$/i.test(process.env.WHATSAPP_BOT_DRY_RUN || '');

// Regex tolérante : « bonjour PD3431 svp » -> PD3431. Insensible à la casse.
const PRODUCT_CODE_RE = /\b(PD\d{3,})\b/i;

function parsePositiveIntLocal(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Questions libres sur le produit en cours (sans redonner le code) : combien de
// temps le "produit actif" reste en mémoire pour un numéro donné.
const PRODUCT_CONTEXT_TTL_MS = 45 * 60 * 1000;
// Garde-fou anti-abus : nombre max de questions répondues par l'IA par numéro,
// sur une fenêtre glissante de 24h (coût maîtrisé même en cas de spam).
const AI_QA_MAX_PER_WINDOW = parsePositiveIntLocal(process.env.WHATSAPP_AI_QA_MAX_PER_DAY, 8);
const AI_QA_WINDOW_MS = 24 * 60 * 60 * 1000;

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

// Payload D7 (accusé de statut/livraison) :
//   { event: { event_type: 'DELIVERY_EVENTS', ... },
//     event_content: { message_status: { request_id, msg_id, status: 'sent'|'delivered'|'read', recipient, ... } } }
// Confirmé sur la doc officielle D7 (receive-whatsapp-postback). Sert au fallback
// SMS : on ne renvoie JAMAIS un SMS si D7 confirme que le WhatsApp a été lu.
function parseD7StatusEvent(body) {
  const status = body && body.event_content && body.event_content.message_status;
  if (!status || !status.request_id) return null;
  return {
    requestId: status.request_id,
    msgId: status.msg_id || null,
    status: String(status.status || '').toLowerCase(),
    recipient: status.recipient || null,
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
    .select('id, name, price, code, is_available, vendor_id, description')
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
    description: product.description || '',
  };
}

// ---------------------------------------------------------------------------
// Contenu des messages
// ---------------------------------------------------------------------------
// Tronque une description à une longueur lisible pour WhatsApp, sans couper un mot.
function shortDescription(text, maxLen = 180) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

function ficheProduitText(produit) {
  const { prix, frais, total } = computeFees(produit.prix);
  const ligneVendeur = produit.vendeurQuartier
    ? `Vendeur : *${produit.vendeurNom}* — ${produit.vendeurQuartier}`
    : `Vendeur : *${produit.vendeurNom}*`;
  // Description du produit (si renseignée) : rend la fiche compréhensible pour le
  // client, au lieu d'un simple code + nom sans explication.
  const desc = shortDescription(produit.description);
  const lignes = [
    `📦 *${produit.nom}*`,
  ];
  if (desc) lignes.push(desc);
  lignes.push(
    `Prix : *${formatFcfa(prix)} FCFA*`,
    ligneVendeur,
    `Code : ${produit.code}`,
    '',
    '✅ Ce produit est bien enregistré sur Validèl.',
    '',
    `Frais de protection : ${formatFcfa(frais)} FCFA`,
    `*Total à payer : ${formatFcfa(total)} FCFA*`,
    '',
    'Votre argent est protégé : le vendeur n\'est payé qu\'après votre confirmation de réception.',
  );
  return lignes.join('\n').slice(0, 1024);
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

const TXT_AI_QUOTA_DEPASSE =
  'Vous avez posé beaucoup de questions aujourd\'hui 🙂 Pour aller plus loin, contactez directement le vendeur ou utilisez le menu "Autres questions".';

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
      '*Frais de protection*',
      `Un frais de protection de ${COMMISSION_PCT} % s'applique sur la transaction, affiché avant toute confirmation. Aucun frais caché.`,
      'Le vendeur ne paie rien.',
    ].join('\n');
  }
  const { frais, total } = computeFees(produit.prix);
  return [
    '*Frais de protection*',
    `Frais de protection de ${COMMISSION_PCT} %, soit ${formatFcfa(frais)} FCFA pour cette commande.`,
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
  const getConvState = (deps && deps.getConversationState) || defaultGetConversationState;
  const setConvState = (deps && deps.setConversationState) || defaultSetConversationState;
  const askProductQuestion = (deps && deps.askProductQuestion) || askProductQuestionAI;
  const phone = parsed.from;

  // 1) Réponse à un bouton interactif
  if (parsed.buttonId) {
    const parts = String(parsed.buttonId).split(':');
    const kindId = parts[0];

    if (kindId === 'pay') {
      const code = parts[1];
      if (phone && code) await setConvState(phone, { productCode: code });
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
      const faqCode = parts.length === 2 ? parts[1] : parts[2];
      if (phone && faqCode) await setConvState(phone, { productCode: faqCode });
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
  if (code) {
    const produit = await findProduct(code);
    if (!produit) return [{ kind: 'text', body: TXT_CODE_INTROUVABLE(code) }];
    // Nouveau produit consulté -> repart avec un quota IA frais.
    if (phone) await setConvState(phone, { productCode: code, aiCount: 0, aiWindowStart: null });
    return [{
      kind: 'buttons',
      body: ficheProduitText(produit),
      buttons: [btnPayer(produit.code), btnAutresQuestions(produit.code)],
    }];
  }

  // Pas de code dans le message : si un produit est "actif" pour ce numéro
  // (consulté récemment), on traite le message comme une question libre à ce
  // sujet, répondue par IA en se basant UNIQUEMENT sur les vraies données produit.
  if (phone) {
    const state = await getConvState(phone);
    const hasActiveProduct = state
      && state.productCode
      && (Date.now() - (state.updatedAt || 0)) < PRODUCT_CONTEXT_TTL_MS;

    if (hasActiveProduct) {
      // Accusé de réception court ("Oui", "Merci", "Ok"...) : le client répond
      // souvent ainsi après une réponse IA. Ce n'est PAS une nouvelle question ->
      // réponse fixe, sans consommer de quota ni rappeler l'IA.
      if (isAcknowledgment(parsed.text)) {
        return [{
          kind: 'buttons',
          body: 'Avec plaisir 😊 N\'hésitez pas si vous avez d\'autres questions.',
          buttons: [btnPayer(state.productCode), btnAutresQuestions(state.productCode)],
        }];
      }
      if (isAiQuotaExceeded(state)) {
        return [{ kind: 'text', body: TXT_AI_QUOTA_DEPASSE }];
      }
      const produit = await findProduct(state.productCode);
      if (produit) {
        const now = Date.now();
        const windowStillValid = state.aiWindowStart && (now - state.aiWindowStart) < AI_QA_WINDOW_MS;
        const nextWindowStart = windowStillValid ? state.aiWindowStart : now;
        const nextCount = (windowStillValid ? (state.aiCount || 0) : 0) + 1;
        await setConvState(phone, { aiWindowStart: nextWindowStart, aiCount: nextCount });

        let answer = null;
        try {
          answer = await askProductQuestion(produit, parsed.text);
        } catch (e) {
          console.error('[WABOT] Erreur réponse IA:', e && e.message);
        }
        if (answer) {
          return [{
            kind: 'buttons',
            body: answer.slice(0, 1024),
            buttons: [btnPayer(state.productCode), btnAutresQuestions(state.productCode)],
          }];
        }
      }
    }
  }

  // Note : « j'ai payé », « bonjour » sans produit actif, etc. tombent ici. On NE
  // change aucun statut, on invite simplement à envoyer un code. (Règle centrale.)
  return [{ kind: 'text', body: TXT_AUCUN_CODE }];
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
// Mémoire de conversation (quel produit un numéro consulte "en ce moment")
// -> permet de répondre à une question libre sans redonner le code produit.
// Persistance Supabase (multi-instance) + secours mémoire.
// ---------------------------------------------------------------------------
const memConversationState = new Map();

async function defaultGetConversationState(phone) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('whatsapp_conversation_state')
        .select('product_code, ai_question_count, ai_window_started_at, updated_at')
        .eq('phone', phone)
        .maybeSingle();
      if (!error) {
        return data ? {
          productCode: data.product_code,
          updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : 0,
          aiCount: data.ai_question_count || 0,
          aiWindowStart: data.ai_window_started_at ? new Date(data.ai_window_started_at).getTime() : 0,
        } : null;
      }
      console.warn('[WABOT] getConversationState Supabase indisponible, secours mémoire:', error.message);
    } catch (e) {
      console.warn('[WABOT] getConversationState exception, secours mémoire:', e && e.message);
    }
  }
  return memConversationState.get(phone) || null;
}

async function defaultSetConversationState(phone, patch) {
  const existing = (await defaultGetConversationState(phone)) || {};
  const next = { ...existing, ...patch, updatedAt: Date.now() };
  memConversationState.set(phone, next);
  if (supabase) {
    try {
      const { error } = await supabase
        .from('whatsapp_conversation_state')
        .upsert({
          phone,
          product_code: next.productCode || null,
          ai_question_count: next.aiCount || 0,
          ai_window_started_at: next.aiWindowStart ? new Date(next.aiWindowStart).toISOString() : null,
          updated_at: new Date(next.updatedAt).toISOString(),
        }, { onConflict: 'phone' });
      if (error) console.warn('[WABOT] setConversationState Supabase erreur:', error.message);
    } catch (e) {
      console.warn('[WABOT] setConversationState exception:', e && e.message);
    }
  }
  return next;
}

// Détecte un accusé de réception court ("Oui", "D'accord", "Merci !", "Ok 👍"...)
// pour éviter de le traiter comme une nouvelle question produit.
const ACK_PHRASES = new Set([
  'oui', 'ok', 'okay', 'daccord', 'merci', 'mercii', 'nickel', 'parfait',
  'super', 'cool', 'bien', 'compris', 'top', 'ca marche', 'entendu', 'ca va',
  'davance merci', 'merci beaucoup',
]);
function isAcknowledgment(text) {
  const normalized = String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // retire les accents
    .replace(/[^a-z\s]/g, '') // retire ponctuation/emoji/chiffres
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length > 0 && ACK_PHRASES.has(normalized);
}

function isAiQuotaExceeded(state) {
  if (!state || !state.aiWindowStart) return false;
  if ((Date.now() - state.aiWindowStart) >= AI_QA_WINDOW_MS) return false; // fenêtre expirée
  return (state.aiCount || 0) >= AI_QA_MAX_PER_WINDOW;
}

// ---------------------------------------------------------------------------
// Questions libres sur le produit -> réponse IA (Claude Haiku)
// Contrainte stricte : répondre UNIQUEMENT à partir des données produit
// fournies, jamais inventer une caractéristique/délai/garantie non indiquée.
// ---------------------------------------------------------------------------
let anthropicClient = null;
function getAnthropicClient() {
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
}

async function askProductQuestionAI(produit, question) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[WABOT] ANTHROPIC_API_KEY manquante, réponse IA impossible');
    return null;
  }
  const client = getAnthropicClient();
  const { prix, frais, total } = computeFees(produit.prix);
  const systeme = [
    'Tu es l\'assistant WhatsApp de Validèl, un service qui sécurise les paiements entre',
    'acheteurs et vendeurs au Sénégal (l\'argent est bloqué jusqu\'à confirmation de réception).',
    'Réponds UNIQUEMENT à partir des informations produit ci-dessous. N\'invente JAMAIS une',
    'caractéristique, une couleur, un délai de livraison ou une garantie qui n\'est pas indiquée.',
    'Si tu ne sais pas, dis-le clairement et invite le client à utiliser le menu "Autres questions"',
    'ou à contacter le vendeur directement.',
    'Ne demande et ne discute JAMAIS de code secret, mot de passe ou code PIN Wave/Orange Money.',
    'Réponds en français, 2 à 3 phrases maximum, ton chaleureux et direct, texte simple (pas de #).',
    'Termine TOUJOURS par une affirmation complète et autonome. Ne pose JAMAIS de question de',
    'relance en fin de réponse (pas de "c\'est bon pour toi ?", "voulez-vous que...", "avez-vous',
    'd\'autres questions ?") : le client n\'a pas besoin de répondre pour clore l\'échange.',
    '',
    'Informations produit :',
    `- Nom : ${produit.nom}`,
    `- Prix : ${formatFcfa(prix)} FCFA`,
    `- Frais de protection : ${formatFcfa(frais)} FCFA (total à payer : ${formatFcfa(total)} FCFA)`,
    `- Vendeur : ${produit.vendeurNom}${produit.vendeurQuartier ? ' — ' + produit.vendeurQuartier : ''}`,
    produit.description ? `- Description : ${produit.description}` : null,
  ].filter(Boolean).join('\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system: systeme,
    messages: [{ role: 'user', content: String(question || '').slice(0, 500) }],
  });

  const textBlock = (response.content || []).find((b) => b.type === 'text');
  return textBlock ? textBlock.text.trim() : null;
}

// ---------------------------------------------------------------------------
// Notifications acheteur : WhatsApp d'abord, SMS de secours si non lu (10 min)
// ---------------------------------------------------------------------------
// Règle commune (livraison, remboursement…) : WhatsApp d'abord, JAMAIS WhatsApp
// + SMS en même temps. On envoie le WhatsApp, on trace le request_id renvoyé par
// D7 + le SMS de secours à envoyer. Si D7 confirme "read" (parseD7StatusEvent) ->
// pas de SMS. Sinon, le reconciler périodique envoie le SMS après 10 min, une
// seule fois (sms_sent). Le texte SMS est stocké par notif -> mécanisme réutilisable.
const DELIVERY_READ_FALLBACK_DELAY_MS = 10 * 60 * 1000;

async function recordDeliveryNotificationSent(requestId, orderId, buyerPhone, fallbackSmsText = null) {
  if (!supabase || !requestId) return;
  try {
    const { error } = await supabase
      .from('whatsapp_delivery_read_tracking')
      .insert({ request_id: requestId, order_id: orderId, buyer_phone: buyerPhone, fallback_sms_text: fallbackSmsText });
    if (error) console.warn('[WABOT] recordDeliveryNotificationSent erreur:', error.message);
  } catch (e) {
    console.warn('[WABOT] recordDeliveryNotificationSent exception:', e && e.message);
  }
}

// Cœur générique : envoie une notif WhatsApp (via sendWhatsAppFn) et programme le
// SMS de secours (fallbackSmsText) si elle n'est pas lue à temps.
async function sendWhatsAppWithSmsFallback({ orderId, buyerPhone, sendWhatsAppFn, fallbackSmsText }) {
  const result = await sendWhatsAppFn();
  const requestId = result && result.data && result.data.request_id;
  if (requestId) {
    await recordDeliveryNotificationSent(requestId, orderId, buyerPhone, fallbackSmsText);
  } else {
    console.warn('[WABOT] Pas de request_id dans la réponse D7, fallback SMS impossible à tracer pour:', orderId);
  }
  return result;
}

async function markDeliveryNotificationRead(requestId) {
  if (!supabase || !requestId) return;
  try {
    const { error } = await supabase
      .from('whatsapp_delivery_read_tracking')
      .update({ read_at: new Date().toISOString() })
      .eq('request_id', requestId)
      .is('read_at', null);
    if (error) console.warn('[WABOT] markDeliveryNotificationRead erreur:', error.message);
    else console.log('[WABOT] WhatsApp lu, SMS de secours annulé pour request_id:', requestId);
  } catch (e) {
    console.warn('[WABOT] markDeliveryNotificationRead exception:', e && e.message);
  }
}

// Notification "en cours de livraison" : WhatsApp d'abord (template approuvé si
// configuré, sinon message libre), SMS de secours si non lu après 10 min.
// Appelée depuis server.js (mark-in-delivery).
async function notifyDeliveryStartedWithFallback({ orderId, buyerPhone, productName, trackingUrl }) {
  if (!buyerPhone) return { success: false, reason: 'no_phone' };

  // Message libre : ne part que dans la fenêtre 24h, mais sert de repli si le
  // template n'est pas configuré OU s'il échoue à l'envoi.
  const sendFreeForm = () => {
    const body = `🚚 Bonne nouvelle ! *${productName || 'votre commande'}* est en cours de livraison.\n\nSuivez votre commande et contactez le livreur ou le vendeur.`;
    return sendWhatsAppCtaUrl(buyerPhone, body, 'Suivre ma commande', trackingUrl);
  };

  const fallbackSmsText = `Votre commande sur Validèl est en cours de livraison. Suivez-la ici : ${PUBLIC_WEB_BASE_URL}/order/${orderId}`;

  return sendWhatsAppWithSmsFallback({
    orderId,
    buyerPhone,
    fallbackSmsText,
    sendWhatsAppFn: async () => {
      if (DELIVERY_TEMPLATE_NAME) {
        // Template approuvé Meta : corps {{1}} = nom du produit ; bouton URL
        // dynamique suffixe = orderId (URL de base définie dans le template).
        try {
          return await sendWhatsAppTemplate(buyerPhone, {
            templateId: DELIVERY_TEMPLATE_NAME,
            language: DELIVERY_TEMPLATE_LANG,
            bodyParams: [productName || 'votre commande'],
            urlButtonSuffix: String(orderId),
          });
        } catch (tplErr) {
          console.warn('[WABOT] Envoi template livraison échoué, repli sur message libre:', tplErr && tplErr.message);
          return sendFreeForm();
        }
      }
      return sendFreeForm();
    },
  });
}

// Notification "remboursement effectué" : WhatsApp d'abord (message libre, pas de
// template dédié), SMS de secours si non lu après 10 min. Appelée depuis server.js
// (approbation admin d'un remboursement). walletLabel = 'Wave' / 'Orange Money'.
async function notifyRefundProcessedWithFallback({ orderId, buyerPhone, amount, walletLabel }) {
  if (!buyerPhone) return { success: false, reason: 'no_phone' };
  const amountStr = Number(amount || 0).toLocaleString('fr-FR');
  const label = walletLabel || 'votre compte mobile';
  const waBody = `✅ *Remboursement effectué*\nVotre remboursement de *${amountStr} FCFA* a été envoyé vers ${label} (${buyerPhone}).\n\nMerci de votre confiance avec Validèl.`;
  const fallbackSmsText = `Validèl : votre remboursement de ${amountStr} FCFA a été effectué vers ${label} (${buyerPhone}). Merci de votre confiance.`;
  return sendWhatsAppWithSmsFallback({
    orderId,
    buyerPhone,
    fallbackSmsText,
    sendWhatsAppFn: () => sendWhatsApp(buyerPhone, waBody),
  });
}

// Reconciler : envoie un SMS de secours pour tout WhatsApp "en cours de livraison"
// non lu après 10 minutes. Ne renvoie JAMAIS 2 fois (sms_sent) et respecte la
// lecture confirmée par D7 entre-temps (read_at renseigné par le webhook).
async function runDeliveryReadFallbackCheck() {
  if (!supabase) return;
  try {
    const { sendSMS } = require('./direct7');
    const cutoff = new Date(Date.now() - DELIVERY_READ_FALLBACK_DELAY_MS).toISOString();
    const { data: rows, error } = await supabase
      .from('whatsapp_delivery_read_tracking')
      .select('request_id, order_id, buyer_phone, fallback_sms_text')
      .is('read_at', null)
      .eq('sms_sent', false)
      .lt('created_at', cutoff)
      .limit(50);
    if (error) {
      console.error('[WABOT] runDeliveryReadFallbackCheck erreur lecture:', error.message);
      return;
    }
    for (const row of rows || []) {
      try {
        // Texte propre à la notif (livraison, remboursement…) ; repli sur le texte
        // livraison pour d'éventuelles lignes anciennes sans fallback_sms_text.
        const text = row.fallback_sms_text
          || `Votre commande sur Validèl est en cours de livraison. Suivez-la ici : ${PUBLIC_WEB_BASE_URL}/order/${row.order_id}`;
        await sendSMS(row.buyer_phone, text);
        await supabase
          .from('whatsapp_delivery_read_tracking')
          .update({ sms_sent: true })
          .eq('request_id', row.request_id);
        console.log('[WABOT] SMS de secours envoyé (WhatsApp non lu après 10 min):', row.buyer_phone);
      } catch (e) {
        console.error('[WABOT] Echec SMS de secours pour', row.buyer_phone, ':', e && e.message);
      }
    }
  } catch (e) {
    console.error('[WABOT] runDeliveryReadFallbackCheck exception:', e && e.message);
  }
}

// Actif par défaut ; ENABLE_WHATSAPP_READ_FALLBACK=false pour désactiver.
if (String(process.env.ENABLE_WHATSAPP_READ_FALLBACK || 'true').toLowerCase() !== 'false') {
  try {
    const cron = require('node-cron');
    cron.schedule('*/2 * * * *', () => {
      runDeliveryReadFallbackCheck().catch((e) => console.error('[WABOT] Erreur reconciler fallback SMS:', e));
    });
    console.log('[WABOT] Reconciler fallback SMS (livraison non lue après 10 min) actif, vérifié toutes les 2 min.');
  } catch (e) {
    console.warn('[WABOT] node-cron indisponible, reconciler fallback SMS désactivé:', e && e.message);
  }
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
  const getConversationState = deps.getConversationState || defaultGetConversationState;
  const setConversationState = deps.setConversationState || defaultSetConversationState;
  const askProductQuestion = deps.askProductQuestion || askProductQuestionAI;
  const markRead = deps.markDeliveryNotificationRead || markDeliveryNotificationRead;
  const senders = {
    sendText: deps.sendText,
    sendButtons: deps.sendButtons,
    sendCtaUrl: deps.sendCtaUrl,
  };

  async function processWebhook(body) {
    // Accusé de statut D7 (sent/delivered/read) -> pas un message, traité à part.
    const statusEvent = parseD7StatusEvent(body);
    if (statusEvent) {
      if (statusEvent.status === 'read') {
        await markRead(statusEvent.requestId);
      }
      return;
    }

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
    const actions = await decideReplies(parsed, {
      findProduct,
      getConversationState,
      setConversationState,
      askProductQuestion,
    });
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
  // Notifs acheteur WhatsApp-d'abord + fallback SMS (utilisées par server.js).
  notifyDeliveryStartedWithFallback,
  notifyRefundProcessedWithFallback,
  // exportés pour les tests
  parseD7Message,
  parseD7StatusEvent,
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
  markDeliveryNotificationRead,
  runDeliveryReadFallbackCheck,
};
