// backend/scripts/demo-bot-sim.js
// Simulateur HORS-LIGNE du bot DÉMO : aucune connexion D7, aucun message réel,
// aucune écriture DB. Prouve la conversation exacte que le numéro démo
// produirait quand un acheteur écrit. Produit et acheteur sont FICTIFS.
//
// Lancer : node backend/scripts/demo-bot-sim.js

// Le module lit ces variables au require -> définir AVANT.
process.env.WHATSAPP_WEBHOOK_SECRET = 'sim-demo-secret';
process.env.VALIDEL_COMMISSION_PCT = process.env.VALIDEL_COMMISSION_PCT || '3';
process.env.PUBLIC_WEB_BASE_URL = 'https://www.validel.shop';
// Désactive le cron reconciler SMS (sinon il garde le process vivant -> pas de sortie).
process.env.ENABLE_WHATSAPP_READ_FALLBACK = 'false';
// Numéro DÉMO (celui qu'on veut tester). Sert uniquement d'étiquette ici : la
// logique de réponse est identique, seul l'émetteur réel change côté D7.
const DEMO_BOT_NUMBER = process.env.WHATSAPP_BOT_NUMBER || '15554677146';

const bot = require('../whatsapp-bot');

// --- Produit + acheteur FICTIFS (aucune donnée réelle) ---------------------
const DEMO_PRODUIT = {
  code: 'PD3431', nom: 'Caisse de Yaourt', prix: 15000,
  vendeurNom: 'Awa Ndiaye', vendeurQuartier: 'Colobane',
  vendeurPhone: '221770000000',
  description: 'Caisse de 12 pots de yaourt nature, fabrication locale.',
};
const BUYER = '221770001122'; // acheteur fictif qui écrit au bot démo
const findProduct = async (code) => (code === DEMO_PRODUIT.code ? DEMO_PRODUIT : null);

// --- État en mémoire, propre à la simu (rien ne touche Supabase) -----------
const convState = new Map();
const seen = new Set();

// --- Capture de ce que le bot AURAIT envoyé (aucun appel réseau) -----------
const transcript = [];
function record(kind, to, body, extra) { transcript.push({ kind, to, body, ...extra }); }

const b = bot.createBot({
  findProduct,
  isDuplicate: async (id) => { if (seen.has(id)) return true; seen.add(id); return false; },
  getConversationState: async (phone) => convState.get(phone) || null,
  setConversationState: async (phone, patch) => {
    const next = { ...(convState.get(phone) || {}), ...patch, updatedAt: Date.now() };
    convState.set(phone, next); return next;
  },
  // Réponse IA simulée (pas d'appel Anthropic réel).
  askProductQuestion: async (p, q) => `Oui, ${p.nom} est disponible et vérifié sur Validèl. Votre paiement reste protégé jusqu'à la réception. (réponse IA simulée pour : « ${q} »)`,
  markDeliveryNotificationRead: async () => {},
  sendFallbackSmsNow: async () => {},
  sendText: async (to, body, from) => record('text', to, body, { from }),
  sendButtons: async (to, body, buttons, from) => record('buttons', to, body, { buttons, from }),
  sendCtaUrl: async (to, body, displayText, url, from) => record('cta', to, body, { displayText, url, from }),
});

let mid = 0;
// recipient = DEMO_BOT_NUMBER : on exerce RÉELLEMENT le routage multi-numéro, le
// bot doit répondre DEPUIS ce numéro (visible dans la colonne « from » ci-dessous).
const inboundText = (text) => ({ event_content: { message: { msg_id: `sim${++mid}`, originator: BUYER, recipient: DEMO_BOT_NUMBER, message_type: 'TEXT', text: { body: text } } } });
const inboundButton = (id) => ({ event_content: { message: { msg_id: `sim${++mid}`, originator: BUYER, recipient: DEMO_BOT_NUMBER, message_type: 'INTERACTIVE', interactive: { button_reply: { id } } } } });

function printReplies(label, userSide) {
  console.log(`\n\x1b[36m[ACHETEUR ${BUYER}] → ${userSide}\x1b[0m`);
  for (const r of transcript.splice(0)) {
    const via = r.from ? `depuis ${r.from}` : 'depuis (numéro par défaut)';
    console.log(`\x1b[32m[BOT ${via}] →\x1b[0m (${r.kind})`);
    console.log(r.body.split('\n').map((l) => '   ' + l).join('\n'));
    if (r.buttons) console.log('   boutons: ' + r.buttons.map((x) => `[ ${x.title} ]`).join('  '));
    if (r.displayText) console.log(`   bouton: [ ${r.displayText} ] → ${r.url}`);
  }
}

(async () => {
  console.log('══════════════════════════════════════════════════════════════');
  console.log(` SIMULATION BOT DÉMO — numéro ${DEMO_BOT_NUMBER}`);
  console.log(' (hors-ligne : aucun message réel, aucune DB, produit fictif)');
  console.log('══════════════════════════════════════════════════════════════');

  // 1) L'acheteur envoie le code produit (ce que fait /demo/{code})
  await b.processWebhook(inboundText('PD3431'));
  printReplies('envoie', 'PD3431');

  // 2) Il pose une question libre sur le produit
  await b.processWebhook(inboundText('Est-ce que le yaourt est frais ?'));
  printReplies('demande', 'Est-ce que le yaourt est frais ?');

  // 3) Il appuie sur « Payer en sécurité »
  await b.processWebhook(inboundButton('pay:PD3431'));
  printReplies('appuie sur', 'Payer en sécurité');

  // 4) Il ouvre « Autres questions » → « Comment ça marche »
  await b.processWebhook(inboundButton('faq:marche:PD3431'));
  printReplies('ouvre', 'Autres questions → Comment ça marche');

  console.log('\n\x1b[33m✓ Fin de la simulation. Ce sont EXACTEMENT les messages que');
  console.log(`  le numéro démo ${DEMO_BOT_NUMBER} enverrait à l'acheteur.\x1b[0m`);
  console.log('\n  ⚠️ Le bouton « Payer maintenant » ci-dessus pointe vers la VRAIE');
  console.log('     page de paiement (/product/PD3431). En démo, arrête-toi là ou');
  console.log('     utilise un produit démo à petit prix.\n');
  process.exit(0); // le module bot peut garder des handles ouverts -> sortie nette
})();
