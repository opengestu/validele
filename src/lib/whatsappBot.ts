// Source UNIQUE côté app pour le bot WhatsApp Validèl :
// numéro + message pré-rempli d'achat + lien wa.me de partage.
//
// ⚠️ Deux endroits ne peuvent PAS importer ce module et dupliquent ces valeurs
// (à mettre à jour ensemble si on change quoi que ce soit ici) :
//   - index.html (script inline exécuté avant React)
//   - functions/acheter/[code].js (Cloudflare Pages Function isolée)
//
// Texte volontairement SANS emoji : c'était lui la source du mojibake « � ».
// Les accents latins (è...) sont sûrs : encodeURIComponent les convertit en
// %XX ASCII avant l'URL. Le bot reconnaît le code produit quoi qu'il arrive.

export const WHATSAPP_BOT_NUMBER =
  String(import.meta.env.VITE_WHATSAPP_BOT_NUMBER || '').replace(/\D/g, '') || '221768171175';

export const buildBotPrefillText = (productCode: string) =>
  `Bonjour ! Pour acheter ce produit (code ${productCode}) en toute securite avec Validèl, appuyez sur Envoyer pour commencer.`;

// Lien wa.me direct vers le bot, phrase complète pré-remplie : intercepté
// nativement par WhatsApp, aucun passage par le web. Long à l'affichage ->
// réservé aux REDIRECTIONS (l'URL n'y est jamais visible).
export const buildBotShareLink = (productCode: string) =>
  `https://wa.me/${WHATSAPP_BOT_NUMBER}?text=${encodeURIComponent(buildBotPrefillText(productCode))}`;

// Variante COURTE pour le PARTAGE (l'URL est visible dans le message WhatsApp) :
// pré-rempli minimal « Demarrer {code} » -> lien compact (~50 caractères),
// ouverture directe du bot sans navigateur. Le client appuie sur Envoyer, le
// bot reconnaît le code et répond avec la fiche complète.
export const buildBotShortShareLink = (productCode: string) =>
  `https://wa.me/${WHATSAPP_BOT_NUMBER}?text=${encodeURIComponent(`Demarrer ${productCode}`)}`;

// ── Catalogue de boutique ───────────────────────────────────────────────────
// Phrase pré-remplie quand un client ouvre le lien de catalogue : elle doit lui
// dire clairement ce qu'il s'apprête à envoyer (« Catalogue BQ94650 » seul était
// cryptique). Le bot n'a besoin que du code boutique présent quelque part dans le
// message (backend/whatsapp-bot.js, SHOP_CODE_RE) — le reste est là pour l'humain.
// Sans emoji (source de mojibake), les accents latins sont sûrs.
//
// ⚠️ Dupliqué dans functions/boutique/[code].js (Pages Function isolée du bundle) :
// à garder aligné avec ce texte.
export const buildShopCatalogPrefillText = (shopCode: string) =>
  `Bonjour ! Montrez-moi le catalogue de cette boutique (code ${shopCode}) sur Validèl. Appuyez sur Envoyer pour l'afficher.`;

export const buildShopCatalogBotLink = (shopCode: string) =>
  `https://wa.me/${WHATSAPP_BOT_NUMBER}?text=${encodeURIComponent(buildShopCatalogPrefillText(shopCode))}`;

// Page catalogue web publique. `baseUrl` = origine publique du site (le vendeur
// partage une URL absolue, jamais un chemin relatif).
export const buildShopCatalogWebLink = (baseUrl: string, shopCode: string) =>
  `${String(baseUrl || '').replace(/\/+$/, '')}/boutique/${encodeURIComponent(shopCode)}`;
