// Cloudflare Pages Function : /demo/{code}
//
// LIEN DE DÉMONSTRATION. Jumeau de functions/acheter/[code].js : même numéro
// (la prod), seul le texte pré-rempli change — il annonce une démonstration.
// Objectif : montrer le vrai parcours d'achat à un prospect.
//
// L'isolation ne vient PLUS du numéro appelé mais du PRODUIT visé : un produit
// is_demo affiche une bannière de démonstration, sa commande est marquée is_demo
// (donc hors payouts et hors chiffres réels), et le parcours s'arrête avant tout
// lien de paiement réel. Voir backend/whatsapp-bot.js -> txtDemoStop.
//
// Comme /acheter/{code}, on fait une redirection 302 CÔTÉ SERVEUR vers wa.me,
// avant tout HTML/JS : indispensable pour le navigateur intégré de WhatsApp
// (WebView isolée) et pour que WhatsApp intercepte nativement wa.me.
//
// Les robots d'aperçu (WhatsApp/Facebook/...) reçoivent la page HTML (via next())
// pour garder la carte d'aperçu OG intacte.
//
// Aucune 2e instance backend n'est nécessaire : le webhook D7 entrant porte le
// champ `recipient` (= numéro business qui a REÇU le message) et le bot répond
// depuis ce numéro. Un seul backend + un seul webhook servent prod ET démo.
// Voir backend/RUNBOOK-DEMO-BOT.md.

// Numéro WhatsApp visé par le lien démo (international, sans +). Source UNIQUE.
//
// ⚠️ CHANGEMENT 2026-08-27 : pointe désormais vers le numéro de PROD.
// La démonstration ne passe plus par un numéro dédié — elle repose sur le
// PRODUIT de démonstration (is_demo), désormais accessible depuis le bot
// principal. Voir backend/whatsapp-bot.js (WHATSAPP_DEMO_PRODUCT_PUBLIC).
//
// Pourquoi : le numéro démo D7 15554677146 est bloqué par Meta tant que son
// Display Name n'est pas approuvé (#131037), et il ne peut donc écrire qu'aux
// destinataires de test déclarés. Un lien de démonstration partagé à un
// prospect tombait dans le vide.
//
// Ce que le lien garde par rapport à /acheter/{code} : son texte pré-rempli
// annonce une démonstration, ce qui reste le bon message pour un prospect.
const DEMO_BOT_NUMBER = '221768171175';

// Même liste que /acheter : le robot d'aperçu WhatsApp s'identifie « WhatsApp/2.x »
// EN DÉBUT de chaîne (d'où l'ancre ^) ; le navigateur intégré d'un vrai visiteur
// commence par « Mozilla/ » et ne doit PAS être traité comme un robot.
const CRAWLER_UA = /^whatsapp\/|facebookexternalhit|facebot|twitterbot|telegrambot|linkedinbot|slackbot|discordbot|pinterest|googlebot|bingbot/i;

export async function onRequestGet(context) {
  const { request, params, next } = context;
  const code = decodeURIComponent(String(params.code || '')).trim();
  const userAgent = request.headers.get('user-agent') || '';

  // Robots d'aperçu ou code absent -> page HTML (balises OG, carte intacte).
  if (!code || CRAWLER_UA.test(userAgent)) {
    return next();
  }

  // Texte volontairement sans emoji (source du mojibake « � ») ; les accents
  // latins sont sûrs (encodeURIComponent -> %XX ASCII). Mention « demonstration »
  // pour que le contexte soit clair côté prospect, sans gêner la détection du code
  // par le bot (regex sur PD####).
  const text = `Bonjour ! Demonstration Validel : pour voir le parcours d'achat de ce produit (code ${code}), appuyez sur Envoyer pour commencer.`;
  return Response.redirect(`https://wa.me/${DEMO_BOT_NUMBER}?text=${encodeURIComponent(text)}`, 302);
}
