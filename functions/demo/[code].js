// Cloudflare Pages Function : /demo/{code}
//
// LIEN DÉMO ISOLÉ. Jumeau de functions/acheter/[code].js mais pointant vers le
// NUMÉRO DÉMO (bot de démonstration), et JAMAIS vers le bot de production.
// Objectif : montrer le vrai parcours d'achat à un prospect sans toucher la prod.
//
// Comme /acheter/{code}, on fait une redirection 302 CÔTÉ SERVEUR vers wa.me,
// avant tout HTML/JS : indispensable pour le navigateur intégré de WhatsApp
// (WebView isolée) et pour que WhatsApp intercepte nativement wa.me.
//
// Les robots d'aperçu (WhatsApp/Facebook/...) reçoivent la page HTML (via next())
// pour garder la carte d'aperçu OG intacte.
//
// ⚠️ Pour que ce lien réponde, le NUMÉRO DÉMO doit avoir SON PROPRE bot qui tourne
// (2e instance backend, WHATSAPP_BOT_NUMBER = numéro démo, webhook D7 du numéro
// démo -> cette instance). Voir backend/RUNBOOK-DEMO-BOT.md.

// Numéro WhatsApp du bot DÉMO (international, sans +). Source UNIQUE : pour changer
// le numéro démo, ne toucher QUE cette ligne.
// ⚠️ 15554677146 = +1 555-467-7146 : préfixe US 555 historiquement fictif. À
// remplacer par le vrai numéro démo approuvé sur D7 le cas échéant.
const DEMO_BOT_NUMBER = '15554677146';

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
