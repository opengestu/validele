// Source UNIQUE côté app pour le bot WhatsApp Validèl :
// numéro + message pré-rempli d'achat + lien wa.me de partage.
//
// ⚠️ Deux endroits ne peuvent PAS importer ce module et dupliquent ces valeurs
// (à mettre à jour ensemble si on change quoi que ce soit ici) :
//   - index.html (script inline exécuté avant React)
//   - functions/acheter/[code].js (Cloudflare Pages Function isolée)
//
// Texte volontairement SANS emoji ni accent : évite tout risque d'encodage
// (mojibake « � ») selon les navigateurs/webviews. Le bot reconnaît le code
// produit quoi qu'il arrive.

export const WHATSAPP_BOT_NUMBER =
  String(import.meta.env.VITE_WHATSAPP_BOT_NUMBER || '').replace(/\D/g, '') || '221768171175';

export const buildBotPrefillText = (productCode: string) =>
  `Bonjour ! Pour acheter ce produit (code ${productCode}) en toute securite avec Validel, appuyez sur Envoyer pour commencer.`;

// Lien wa.me direct vers le bot, code pré-rempli : intercepté nativement par
// WhatsApp, aucun passage par le web -> fonctionne à tous les coups.
export const buildBotShareLink = (productCode: string) =>
  `https://wa.me/${WHATSAPP_BOT_NUMBER}?text=${encodeURIComponent(buildBotPrefillText(productCode))}`;
