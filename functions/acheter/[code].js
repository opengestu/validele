// Cloudflare Pages Function : /acheter/{code}
//
// Redirection 302 CÔTÉ SERVEUR vers le bot WhatsApp, avant tout HTML/JS.
// Indispensable pour le navigateur intégré de WhatsApp (WebView isolée avec son
// propre cache/service worker) : aucun vieux cache ne peut intercepter un 302
// réseau, et WhatsApp intercepte nativement wa.me -> ouvre la discussion direct.
//
// Les robots d'aperçu (WhatsApp/Facebook/Twitter...) reçoivent eux la page HTML
// (via next() -> fallback SPA index.html) pour garder la carte d'aperçu OG.
//
// NB : la règle "/acheter/*" a été retirée de public/_redirects car _redirects
// s'exécute AVANT les Functions et court-circuiterait celle-ci.

const BOT_NUMBER = '221768171175'; // = WHATSAPP_BOT_NUMBER / VITE_WHATSAPP_BOT_NUMBER

const CRAWLER_UA = /whatsapp|facebookexternalhit|facebot|twitterbot|telegrambot|linkedinbot|slackbot|discordbot|pinterest|googlebot|bingbot/i;

export async function onRequestGet(context) {
  const { request, params, next } = context;
  const code = decodeURIComponent(String(params.code || '')).trim();
  const userAgent = request.headers.get('user-agent') || '';

  // Robots d'aperçu ou code absent -> page HTML (balises OG, carte intacte).
  if (!code || CRAWLER_UA.test(userAgent)) {
    return next();
  }

  // Texte volontairement sans emoji : évite tout risque d'encodage (mojibake)
  // selon les navigateurs/webviews. Le bot reconnaît le code quoi qu'il arrive.
  const text = `Bonjour ! Pour acheter ce produit (code ${code}) en toute securite avec Validel, appuyez sur Envoyer pour commencer.`;
  return Response.redirect(`https://wa.me/${BOT_NUMBER}?text=${encodeURIComponent(text)}`, 302);
}
