// backend/scripts/catalog-bot-sim.js
// Simulateur du parcours CATALOGUE DE BOUTIQUE, branché sur la VRAIE base.
//
// Contrairement à demo-bot-sim.js (produit fictif, tout en mémoire), celui-ci
// lit les vraies boutiques et les vrais produits : c'est ce qui permet de voir
// la conversation exacte qu'un client recevra, avec ses propres articles.
//
// Il reste hermétique : aucun message n'est envoyé, aucune écriture en base.
// Les seuls accès Supabase sont les SELECT de trouverBoutique/trouverProduit ;
// la déduplication et l'état de conversation — qui écrivent normalement — sont
// remplacés par de la mémoire locale, et la création de commande / le lien de
// paiement sont stubés pour qu'aucun scénario ne puisse toucher de l'argent.
//
// Lancer depuis backend/ (dotenv lit backend/.env via le cwd) :
//   cd backend && node scripts/catalog-bot-sim.js [CODE_BOUTIQUE]

process.env.WHATSAPP_WEBHOOK_SECRET = 'sim-catalog-secret';
// Le cron du reconciler SMS garderait le process vivant -> pas de sortie nette.
// dotenv n'écrase pas une variable déjà définie, ce réglage tient donc.
process.env.ENABLE_WHATSAPP_READ_FALLBACK = 'false';

const bot = require('../whatsapp-bot');

const SHOP_CODE = (process.argv[2] || 'BQ94650').toUpperCase();
const BUYER = '221770001122'; // acheteur fictif

const convState = new Map();
const seen = new Set();
const transcript = [];

const b = bot.createBot({
  // findProduct / findShop NON injectés : on veut les vraies lectures Supabase.
  isDuplicate: async (id) => { if (seen.has(id)) return true; seen.add(id); return false; },
  getConversationState: async (phone) => convState.get(phone) || null,
  setConversationState: async (phone, patch) => {
    const next = { ...(convState.get(phone) || {}), ...patch, updatedAt: Date.now() };
    convState.set(phone, next);
    return next;
  },
  askProductQuestion: async (p, q) => `(réponse IA simulée sur ${p.nom} pour : « ${q} »)`,
  markDeliveryNotificationRead: async () => {},
  sendFallbackSmsNow: async () => {},
  createGuestOrder: async () => { throw new Error('[SIM] création de commande bloquée'); },
  initiatePayment: async () => { throw new Error('[SIM] paiement bloqué'); },
  sendText: async (to, body, from) => transcript.push({ kind: 'text', body, from }),
  sendButtons: async (to, body, buttons, from) => transcript.push({ kind: 'buttons', body, buttons, from }),
  sendCtaUrl: async (to, body, displayText, url, from) => transcript.push({ kind: 'cta', body, displayText, url, from }),
  sendList: async (to, body, buttonLabel, rows, from) => transcript.push({ kind: 'list', body, buttonLabel, rows, from }),
});

let mid = 0;
const inboundText = (text) => ({
  event_content: { message: { msg_id: `sim${++mid}`, originator: BUYER, message_type: 'TEXT', text: { body: text } } },
});
const inboundListReply = (id) => ({
  event_content: { message: { msg_id: `sim${++mid}`, originator: BUYER, message_type: 'INTERACTIVE', interactive: { list_reply: { id } } } },
});

const indent = (text) => String(text).split(String.fromCharCode(10)).map((l) => '   ' + l).join(String.fromCharCode(10));

function printReplies(userAction) {
  console.log(`${String.fromCharCode(10)}\x1b[36m[CLIENT] → ${userAction}\x1b[0m`);
  const sent = transcript.splice(0);
  if (sent.length === 0) {
    console.log('\x1b[31m   (aucune réponse — le bot n\'a rien renvoyé)\x1b[0m');
    return;
  }
  for (const r of sent) {
    console.log(`\x1b[32m[BOT] →\x1b[0m (${r.kind})`);
    console.log(indent(r.body));
    if (r.buttons) console.log('   boutons: ' + r.buttons.map((x) => `[ ${x.title} ]`).join('  '));
    if (r.rows) {
      console.log(`   bouton de liste: [ ${r.buttonLabel} ]`);
      for (const row of r.rows) {
        console.log(`     • ${row.title}${row.description ? '  —  ' + row.description : ''}   (id: ${row.id})`);
      }
    }
    if (r.displayText) console.log(`   bouton: [ ${r.displayText} ] → ${r.url}`);
  }
  return sent;
}

(async () => {
  console.log('══════════════════════════════════════════════════════════════');
  console.log(` SIMULATION CATALOGUE — boutique ${SHOP_CODE}`);
  console.log(' (vraies données, aucun message envoyé, aucune écriture)');
  console.log('══════════════════════════════════════════════════════════════');

  // 1) Le client ouvre le lien catalogue du vendeur -> WhatsApp pré-remplit ceci.
  await b.processWebhook(inboundText(`Catalogue ${SHOP_CODE}`));
  const listReplies = printReplies(`Catalogue ${SHOP_CODE}`);

  // 2) Il choisit le premier article de la liste.
  const list = (listReplies || []).find((r) => r.kind === 'list');
  if (!list || !list.rows.length) {
    console.log(`${String.fromCharCode(10)}\x1b[33m⚠ Pas de liste renvoyée : on s'arrête ici.\x1b[0m`);
    console.log('  Vérifiez que la boutique existe et a au moins un produit disponible.');
    process.exit(0);
  }

  const firstRow = list.rows[0];
  await b.processWebhook(inboundListReply(firstRow.id));
  printReplies(`sélectionne « ${firstRow.title} » dans la liste`);

  console.log(`${String.fromCharCode(10)}\x1b[33m✓ Fin de la simulation.\x1b[0m`);
  console.log('  Ce sont exactement les messages que le bot enverrait au client.');
  console.log(`${String.fromCharCode(10)}`);
  process.exit(0);
})();
