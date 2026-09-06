// Génère la bannière des moyens de paiement affichée en en-tête du message
// WhatsApp qui demande « Comment souhaitez-vous payer ? ».
//
// Pourquoi une seule image : un bouton de réponse WhatsApp n'accepte que `id` et
// `title` (20 caractères) — aucun champ image. Le seul visuel possible est un
// `header` de type image, unique pour tout le message : on y met donc les deux
// logos côte à côte, au-dessus des deux boutons texte.
//
// Lancer : node scripts/generate-wallet-banner.mjs
import sharp from 'sharp';
import path from 'path';
import { existsSync } from 'fs';

const WAVE = './public/images/wave.png';
const ORANGE = './public/images/orange_money.png';
const OUT = './public/images/wallets-wave-orange.png';

// 1.91:1 — le ratio qu'attend WhatsApp pour un en-tête image (sinon il recadre).
const WIDTH = 1200;
const HEIGHT = 628;
const LOGO = 380;
const GAP = Math.round((WIDTH - LOGO * 2) / 3);
const TOP = Math.round((HEIGHT - LOGO) / 2);

for (const p of [WAVE, ORANGE]) {
  if (!existsSync(p)) {
    console.error(`Logo introuvable : ${p}`);
    process.exit(1);
  }
}

// `contain` + fond transparent : on ne déforme pas les logos, on les inscrit
// dans un carré identique pour qu'ils pèsent visuellement pareil.
const fit = (file) => sharp(file)
  .resize(LOGO, LOGO, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

const [wave, orange] = await Promise.all([fit(WAVE), fit(ORANGE)]);

await sharp({
  create: {
    width: WIDTH,
    height: HEIGHT,
    channels: 4,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  },
})
  .composite([
    { input: wave, left: GAP, top: TOP },
    { input: orange, left: GAP * 2 + LOGO, top: TOP },
  ])
  .png()
  .toFile(OUT);

const { size } = await sharp(OUT).metadata().then(async (m) => ({ ...m, size: (await sharp(OUT).toBuffer()).length }));
console.log(`✅ ${path.resolve(OUT)} — ${WIDTH}x${HEIGHT}, ${Math.round(size / 1024)} Ko`);
console.log('   URL publique attendue : https://www.validel.shop/images/wallets-wave-orange.png');
