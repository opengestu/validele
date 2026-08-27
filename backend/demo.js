// backend/demo.js
// Source UNIQUE de la notion de « démo » côté backend.
//
// Un numéro de bot démo n'est pas un second produit : c'est un MODE. Même code,
// même parcours, mêmes écrans — seules les données créées sont marquées `is_demo`
// et tenues à l'écart de l'argent réel (payouts) et des chiffres réels.
//
// Le numéro par défaut est celui vérifié sur le compte D7 (cf. RUNBOOK-DEMO-BOT.md).
// Surchargeable sans redéploiement via WHATSAPP_DEMO_BOT_NUMBERS (séparés par des
// virgules) pour en ajouter un 2e (ex. un numéro de recette) ou tout désactiver.
const DEFAULT_DEMO_BOT_NUMBERS = ['15554677146'];

function parseNumbers(raw) {
  return String(raw || '')
    .split(',')
    .map((n) => n.replace(/\D/g, ''))
    .filter(Boolean);
}

const configured = parseNumbers(process.env.WHATSAPP_DEMO_BOT_NUMBERS);
// Variable définie mais vide -> aucun numéro démo (interrupteur d'arrêt).
const DEMO_BOT_NUMBERS = process.env.WHATSAPP_DEMO_BOT_NUMBERS !== undefined
  ? configured
  : DEFAULT_DEMO_BOT_NUMBERS.slice();

// `n` = numéro business au format D7 (chiffres seuls, sans +). Tolère les autres
// formats (+221…, espaces) : on compare toujours sur les chiffres.
function isDemoBotNumber(n) {
  const digits = String(n || '').replace(/\D/g, '');
  return digits.length > 0 && DEMO_BOT_NUMBERS.includes(digits);
}

// Code du produit de démonstration. Hors de la plage générée par l'app
// (`PD` + 1000-9999, cf. VendorDashboard) : aucune collision possible avec un
// vrai produit vendeur. Reconnu par le bot via /\b(PD\d{3,})\b/.
const DEMO_PRODUCT_CODE = process.env.DEMO_PRODUCT_CODE || 'PD0000';

module.exports = {
  DEMO_BOT_NUMBERS,
  isDemoBotNumber,
  DEMO_PRODUCT_CODE,
};
