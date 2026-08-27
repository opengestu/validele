// backend/scripts/meta-send-test.js
// Test RÉEL du numéro démo sur WhatsApp Cloud API (Meta). Envoie un vrai message
// et facture un vrai crédit — à lancer sciemment.
//
//   node backend/scripts/meta-send-test.js --check
//   node backend/scripts/meta-send-test.js 221774254729
//   node backend/scripts/meta-send-test.js 221774254729 "Mon texte"
//
// --check seul (sans destinataire) n'envoie RIEN : il interroge l'état du numéro
// chez Meta, dont `name_status` — le champ qui dit noir sur blanc si le Display
// Name est approuvé. C'est la réponse directe au blocage #131037, sans dépenser
// un message.
//
// Variables lues (backend/.env) :
//   META_ACCESS_TOKEN, META_PHONE_NUMBER_ID, META_BOT_NUMBER,
//   META_GRAPH_VERSION (défaut v21.0)

require('dotenv').config();
const axios = require('axios');

const GRAPH_BASE = process.env.META_GRAPH_BASE || 'https://graph.facebook.com';
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';
const TOKEN = process.env.META_ACCESS_TOKEN || '';
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID || '';
const BOT_NUMBER = String(process.env.META_BOT_NUMBER || '').replace(/\D/g, '');

// Décodage des rejets Meta les plus fréquents sur ce parcours. Sans ça, un code
// nu ne dit rien d'actionnable.
const CODES = {
  190: 'Token invalide ou expiré -> régénère le token System User.',
  131037: 'Display Name NON APPROUVÉ. Le numéro ne peut écrire qu\'aux destinataires de test déclarés. C\'est exactement le blocage du numéro D7 15554677146.',
  131030: 'Destinataire absent de la liste autorisée (Business non vérifié). Ajoute ce numéro dans les destinataires de test.',
  131047: 'Fenêtre de 24h fermée : il faut un template approuvé pour réengager. Normal si le destinataire ne t\'a jamais écrit.',
  131026: 'Le destinataire n\'a pas WhatsApp, ou le numéro est mal formé (E.164 sans +).',
  100: 'Paramètre invalide -> vérifie META_PHONE_NUMBER_ID et le format du destinataire.',
  133010: 'Numéro non enregistré sur Cloud API -> termine l\'enregistrement du numéro.',
};

function fail(msg) { console.error(`\n❌ ${msg}\n`); process.exit(1); }

function explain(err) {
  const code = Number(err && err.code);
  console.error('\n❌ Rejet Meta');
  console.error(`   code    : #${err.code}`);
  console.error(`   message : ${err.message}`);
  if (err.error_data && err.error_data.details) console.error(`   details : ${err.error_data.details}`);
  if (CODES[code]) console.error(`\n   → ${CODES[code]}`);
  console.error('');
}

async function checkNumber() {
  const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${PHONE_NUMBER_ID}`;
  const res = await axios.get(url, {
    params: { fields: 'verified_name,display_phone_number,name_status,quality_rating,code_verification_status,platform_type' },
    headers: { Authorization: `Bearer ${TOKEN}` },
    timeout: 15000,
  });
  const d = res.data || {};
  console.log('\n📋 État du numéro chez Meta');
  console.log(`   numéro affiché      : ${d.display_phone_number || '—'}`);
  console.log(`   nom vérifié         : ${d.verified_name || '—'}`);
  console.log(`   name_status         : ${d.name_status || '—'}`);
  console.log(`   qualité             : ${d.quality_rating || '—'}`);
  console.log(`   vérification code   : ${d.code_verification_status || '—'}`);
  console.log(`   plateforme          : ${d.platform_type || '—'}`);

  const status = String(d.name_status || '').toUpperCase();
  if (status === 'APPROVED') {
    console.log('\n✅ Display Name APPROUVÉ -> ce numéro peut écrire à n\'importe qui.');
  } else if (status) {
    console.log(`\n⚠️  Display Name pas encore approuvé (${status}).`);
    console.log('   Tant que ce n\'est pas APPROVED, attends-toi à #131037 vers un numéro non déclaré en test.');
  }
  return d;
}

async function sendText(to, body) {
  const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body },
  };
  console.log(`\n📤 Envoi ${BOT_NUMBER || PHONE_NUMBER_ID} -> ${to}`);
  const res = await axios.post(url, payload, {
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    timeout: 20000,
  });
  console.log('\n✅ Accepté par Meta');
  console.log(JSON.stringify(res.data, null, 2));
  console.log('\n⚠️  « Accepté » ≠ « remis ». Le rejet peut encore arriver en webhook de statut');
  console.log('   (c\'est ce qui s\'est passé sur D7 : status=rejected, #131037).');
  console.log('   Vérifie la réception sur le téléphone, et les logs [META][DEMO] côté serveur.');
}

(async () => {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const positional = args.filter((a) => !a.startsWith('--'));
  const to = String(positional[0] || '').replace(/\D/g, '');
  const body = positional[1] || 'Test Validel : demonstration du bot WhatsApp. Repondez PD0000 pour lancer le parcours.';

  if (!TOKEN) fail('META_ACCESS_TOKEN absent de backend/.env');
  if (!PHONE_NUMBER_ID) fail('META_PHONE_NUMBER_ID absent de backend/.env');

  try {
    await checkNumber();
  } catch (e) {
    const err = e && e.response && e.response.data && e.response.data.error;
    if (err) { explain(err); process.exit(1); }
    fail(`Impossible d'interroger le numéro : ${e.message}`);
  }

  if (checkOnly || !to) {
    if (!to && !checkOnly) {
      console.log('\nℹ️  Aucun destinataire fourni -> aucun message envoyé.');
      console.log('   Pour envoyer : node backend/scripts/meta-send-test.js 221774254729\n');
    } else {
      console.log('');
    }
    process.exit(0);
  }

  if (to.length < 8) fail(`Destinataire « ${positional[0]} » invalide. Format E.164 SANS + : 221774254729`);

  try {
    await sendText(to, body);
    process.exit(0);
  } catch (e) {
    const err = e && e.response && e.response.data && e.response.data.error;
    if (err) { explain(err); process.exit(1); }
    fail(`Échec de l'envoi : ${e.message}`);
  }
})();
