// Cloudflare Pages Function : /boutique/{code}
//
// Redirection 302 CÔTÉ SERVEUR vers le bot WhatsApp, avant tout HTML/JS.
// Le lien de catalogue d'une boutique ouvre DIRECTEMENT le bot avec le message
// « Catalogue {code} » pré-rempli — le bot répond alors avec la liste des
// produits. Même principe que /acheter/{code} (functions/acheter/[code].js),
// à la seule différence du texte pré-rempli.
//
// Pourquoi un 302 serveur plutôt qu'une page web : le navigateur intégré de
// WhatsApp (WebView isolée, cache/service worker propres) intercepte nativement
// wa.me -> ouvre la discussion direct, et aucun vieux cache ne peut intercepter
// un 302 réseau.
//
// Les robots d'aperçu (WhatsApp/Facebook...) reçoivent la page HTML (via next()
// -> fallback SPA index.html) pour garder la carte d'aperçu.
//
// NB : la règle « /boutique/* » a été retirée de public/_redirects car _redirects
// s'exécute AVANT les Functions et court-circuiterait celle-ci.

const BOT_NUMBER = '221768171175'; // = WHATSAPP_BOT_NUMBER / VITE_WHATSAPP_BOT_NUMBER

// Robot d'aperçu WhatsApp : « WhatsApp/2.x.y » en DÉBUT de chaîne. Le navigateur
// INTÉGRÉ de WhatsApp (vrai visiteur) commence par « Mozilla/ ». D'où l'ancre ^,
// sinon un vrai clic depuis WhatsApp recevrait la page web au lieu du 302.
const CRAWLER_UA = /^whatsapp\/|facebookexternalhit|facebot|twitterbot|telegrambot|linkedinbot|slackbot|discordbot|pinterest|googlebot|bingbot/i;

export async function onRequestGet(context) {
  const { request, params, next } = context;
  const code = decodeURIComponent(String(params.code || '')).trim();
  const userAgent = request.headers.get('user-agent') || '';

  // Robots d'aperçu ou code absent -> page HTML (carte d'aperçu intacte).
  if (!code || CRAWLER_UA.test(userAgent)) {
    return next();
  }

  // Phrase pré-remplie explicite pour le client (« Catalogue BQxxxxx » seul était
  // cryptique). Le bot n'a besoin que du code boutique présent dans le message
  // (backend/whatsapp-bot.js : SHOP_CODE_RE + extractShopCode) ; le reste est là
  // pour l'humain. Sans emoji (mojibake) ; les accents latins sont sûrs.
  // À garder ALIGNÉ avec buildShopCatalogPrefillText (src/lib/whatsappBot.ts).
  const text = `Bonjour ! Montrez-moi le catalogue de cette boutique (code ${code}) sur Validèl. Appuyez sur Envoyer pour l'afficher.`;
  return Response.redirect(`https://wa.me/${BOT_NUMBER}?text=${encodeURIComponent(text)}`, 302);
}
