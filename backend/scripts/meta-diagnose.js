// backend/scripts/meta-diagnose.js
// Diagnostic LECTURE SEULE de la chaine entrante Meta -> webhook -> bot.
// N'envoie aucun message, n'ecrit rien chez Meta.
//
//   node backend/scripts/meta-diagnose.js
//
// Repond a la question « pourquoi le bot ne repond pas ? » en verifiant, dans
// l'ordre ou les choses cassent en pratique :
//   1. le numero est-il bien enregistre sur Cloud API ?
//   2. la WABA est-elle ABONNEE a l'app ? (etape distincte de la validation
//      de l'URL de rappel — c'est LA cause la plus frequente d'un silence total)
//   3. quels champs webhook sont abonnes ? (`messages` est indispensable)
//   4. le Display Name est-il approuve ? (blocage #131037 en SORTIE)
//
// Variables : META_ACCESS_TOKEN, META_PHONE_NUMBER_ID, META_WABA_ID
// (alias acceptes : WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
//  WHATSAPP_BUSINESS_ACCOUNT_ID)

require('dotenv').config();
const axios = require('axios');

const GRAPH_BASE = process.env.META_GRAPH_BASE || 'https://graph.facebook.com';
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';
const TOKEN = process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || '';
const PHONE_ID = process.env.META_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const WABA_ID = process.env.META_WABA_ID || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '';

const OK = '  [OK]';
const KO = '  [KO]';
const NA = '  [??]';

function graphError(e) {
  const err = e && e.response && e.response.data && e.response.data.error;
  if (!err) return (e && e.message) || 'erreur inconnue';
  return `#${err.code} ${err.message}`;
}

async function get(path, params) {
  const res = await axios.get(`${GRAPH_BASE}/${GRAPH_VERSION}/${path}`, {
    params, headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 15000,
  });
  return res.data;
}

(async () => {
  if (!TOKEN) { console.error('\nMETA_ACCESS_TOKEN absent.\n'); process.exit(1); }
  if (!PHONE_ID) { console.error('\nMETA_PHONE_NUMBER_ID absent.\n'); process.exit(1); }

  let blocking = 0;

  // --- 1. Etat du numero ---------------------------------------------------
  console.log('\n=== 1. Numero ===');
  let phone = null;
  try {
    phone = await get(PHONE_ID, {
      fields: 'display_phone_number,verified_name,name_status,quality_rating,code_verification_status,platform_type,status',
    });
    console.log(`     numero        : ${phone.display_phone_number || '-'}`);
    console.log(`     nom verifie   : ${phone.verified_name || '-'}`);
    console.log(`     plateforme    : ${phone.platform_type || '-'}`);
    console.log(`     statut        : ${phone.status || '-'}`);

    const plat = String(phone.platform_type || '').toUpperCase();
    if (plat && plat !== 'CLOUD_API') {
      console.log(`${KO} Le numero n'est PAS sur CLOUD_API (${plat}).`);
      console.log('       -> Aucun webhook ne partira vers ton backend. Termine l\'enregistrement');
      console.log('          du numero sur Cloud API dans WhatsApp Manager.');
      blocking += 1;
    } else if (plat === 'CLOUD_API') {
      console.log(`${OK} Numero sur Cloud API.`);
    }
  } catch (e) {
    console.log(`${KO} Lecture du numero impossible : ${graphError(e)}`);
    blocking += 1;
  }

  // --- 2. La WABA est-elle abonnee a l'app ? -------------------------------
  console.log('\n=== 2. Abonnement de la WABA a l\'app (cause n1 du silence total) ===');
  if (!WABA_ID) {
    console.log(`${NA} META_WABA_ID / WHATSAPP_BUSINESS_ACCOUNT_ID absent -> verification impossible.`);
    console.log('       C\'est pourtant LE point a verifier en priorite. Recupere l\'ID de la WABA');
    console.log('       dans WhatsApp Manager et relance.');
  } else {
    try {
      const subs = await get(`${WABA_ID}/subscribed_apps`);
      const apps = (subs && subs.data) || [];
      if (!apps.length) {
        console.log(`${KO} AUCUNE app abonnee a cette WABA.`);
        console.log('       -> C\'est pour ca que rien n\'arrive. Meta ne relaie les messages entrants');
        console.log('          QUE si la WABA est abonnee a ton app. Valider l\'URL de rappel ne suffit pas.');
        console.log('');
        console.log('       Correction (une seule commande) :');
        console.log(`         curl -X POST "${GRAPH_BASE}/${GRAPH_VERSION}/${WABA_ID}/subscribed_apps" \\`);
        console.log('              -H "Authorization: Bearer $META_ACCESS_TOKEN"');
        blocking += 1;
      } else {
        console.log(`${OK} ${apps.length} app(s) abonnee(s) :`);
        apps.forEach((a) => {
          const w = a.whatsapp_business_api_data || a;
          console.log(`       - ${w.name || '(sans nom)'} (id ${w.id || '?'})`);
        });
      }
    } catch (e) {
      console.log(`${KO} Lecture des abonnements impossible : ${graphError(e)}`);
      console.log('       (le token System User a-t-il bien whatsapp_business_management ?)');
    }
  }

  // --- 3. Champs webhook abonnes -------------------------------------------
  console.log('\n=== 3. Champ `messages` ===');
  if (WABA_ID) {
    try {
      const subs = await get(`${WABA_ID}/subscribed_apps`);
      const apps = (subs && subs.data) || [];
      const fields = apps
        .map((a) => (a.whatsapp_business_api_data && a.whatsapp_business_api_data.subscribed_fields) || a.subscribed_fields)
        .filter(Boolean)
        .flat();
      if (!fields.length) {
        console.log(`${NA} Champs non exposes par l'API a ce niveau.`);
        console.log('       Verifie a la main : App -> WhatsApp -> Configuration -> Champs webhook');
        console.log('       -> « Gerer » -> la case `messages` doit etre cochee.');
      } else if (fields.includes('messages')) {
        console.log(OK + " champ messages abonne.");
      } else {
        console.log(KO + ' champ messages PAS abonne. Champs actuels : ' + fields.join(', '));
        blocking += 1;
      }
    } catch (e) {
      console.log(`${NA} ${graphError(e)}`);
    }
  } else {
    console.log(`${NA} WABA_ID absent.`);
  }

  // --- 4. Display Name (blocage en SORTIE, pas en entree) ------------------
  console.log('\n=== 4. Display Name (blocage #131037 en sortie) ===');
  if (phone) {
    const st = String(phone.name_status || '').toUpperCase();
    console.log(`     name_status   : ${phone.name_status || '-'}`);
    console.log(`     qualite       : ${phone.quality_rating || '-'}`);
    if (st === 'APPROVED') {
      console.log(`${OK} Approuve -> le numero peut ecrire a n'importe qui.`);
    } else if (st) {
      console.log(`${KO} Non approuve (${st}) -> #131037 vers un numero non declare en test.`);
      console.log('       N\'explique PAS un silence total : ce blocage produirait une erreur');
      console.log('       [META] Erreur envoi WhatsApp dans les logs Render. Si les logs sont');
      console.log('       muets, le probleme est en ENTREE (points 2 et 3 ci-dessus).');
    }
  }

  console.log('\n=== Verdict ===');
  if (blocking === 0) {
    console.log('Aucun blocage detecte en entree. Si le bot reste muet, regarde les logs Render');
    console.log('au moment exact ou tu envoies : une ligne [META] doit apparaitre. Si rien');
    console.log('n\'apparait, Meta ne relaie pas — reverifie les points 2 et 3 dans la console.');
  } else {
    console.log(`${blocking} blocage(s) a corriger ci-dessus.`);
  }
  console.log('');
  process.exit(0);
})().catch((e) => { console.error('\nEchec du diagnostic :', graphError(e), '\n'); process.exit(1); });
