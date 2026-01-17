import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const LOGO_PATH = './src/assets/validel-logo.png';
const OUTPUT_DIR = './playstore-assets';

// Couleurs de l'app
const BRAND_COLOR = '#2E7D32'; // Vert
const BG_COLOR = '#FFFFFF';

async function createPlayStoreAssets() {
  // Créer le dossier de sortie
  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true });
  }

  console.log('🎨 Génération des assets Play Store...\n');

  // 1. Icône haute résolution 512x512 (obligatoire)
  console.log('1️⃣ Icône 512x512...');
  const logoBuffer = await sharp(LOGO_PATH).toBuffer();
  const logoMeta = await sharp(logoBuffer).metadata();
  
  // Redimensionner le logo à 400x400 pour laisser de la marge
  const resizedLogo = await sharp(logoBuffer)
    .resize(400, 400, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: BG_COLOR
    }
  })
    .composite([{
      input: resizedLogo,
      gravity: 'center'
    }])
    .png()
    .toFile(path.join(OUTPUT_DIR, 'icon-512x512.png'));
  console.log('   ✅ icon-512x512.png');

  // 2. Feature Graphic 1024x500 (obligatoire)
  console.log('2️⃣ Feature Graphic 1024x500...');
  
  // Créer le logo pour la bannière (250x250)
  const bannerLogo = await sharp(logoBuffer)
    .resize(200, 200, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  // Créer un dégradé vert
  const gradientSvg = `
    <svg width="1024" height="500">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#1B5E20;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#4CAF50;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="1024" height="500" fill="url(#grad)"/>
      <text x="620" y="200" font-family="Arial, sans-serif" font-size="72" font-weight="bold" fill="white">Validèl</text>
      <text x="620" y="280" font-family="Arial, sans-serif" font-size="28" fill="rgba(255,255,255,0.9)">Paiement sécurisé</text>
      <text x="620" y="320" font-family="Arial, sans-serif" font-size="28" fill="rgba(255,255,255,0.9)">Wave &amp; Orange Money</text>
      <text x="620" y="400" font-family="Arial, sans-serif" font-size="22" fill="rgba(255,255,255,0.7)">🛡️ Escrow • 📱 QR Code • 🚚 Livraison</text>
    </svg>
  `;

  await sharp(Buffer.from(gradientSvg))
    .composite([{
      input: bannerLogo,
      left: 150,
      top: 150
    }])
    .png()
    .toFile(path.join(OUTPUT_DIR, 'feature-graphic-1024x500.png'));
  console.log('   ✅ feature-graphic-1024x500.png');

  // 3. Screenshots mockups (cadres téléphone)
  console.log('3️⃣ Génération des screenshots...');
  
  const screenshots = [
    { name: 'screenshot-1-home', title: 'Accueil', subtitle: 'Achetez et vendez en securite', color: '#2E7D32' },
    { name: 'screenshot-2-payment', title: 'Paiement', subtitle: 'Wave et Orange Money', color: '#FF6F00' },
    { name: 'screenshot-3-tracking', title: 'Suivi', subtitle: 'Suivez vos commandes en temps reel', color: '#1565C0' },
    { name: 'screenshot-4-qrcode', title: 'QR Code', subtitle: 'Validation rapide a la livraison', color: '#7B1FA2' },
  ];

  for (const screen of screenshots) {
    const screenshotSvg = `
      <svg width="1080" height="1920">
        <defs>
          <linearGradient id="bg${screen.name}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:${screen.color};stop-opacity:1" />
            <stop offset="100%" style="stop-color:#000000;stop-opacity:0.8" />
          </linearGradient>
        </defs>
        <rect width="1080" height="1920" fill="url(#bg${screen.name})"/>
        
        <!-- Phone frame -->
        <rect x="140" y="400" width="800" height="1300" rx="40" fill="#1a1a1a"/>
        <rect x="160" y="420" width="760" height="1260" rx="30" fill="#ffffff"/>
        
        <!-- App content mockup -->
        <rect x="180" y="440" width="720" height="80" fill="#f5f5f5"/>
        <text x="540" y="495" font-family="Arial" font-size="32" fill="#333" text-anchor="middle">Validèl</text>
        
        <!-- Content area -->
        <rect x="200" y="550" width="680" height="150" rx="15" fill="#e8f5e9"/>
        <rect x="200" y="720" width="680" height="150" rx="15" fill="#fff3e0"/>
        <rect x="200" y="890" width="680" height="150" rx="15" fill="#e3f2fd"/>
        <rect x="200" y="1060" width="680" height="150" rx="15" fill="#f3e5f5"/>
        
        <!-- Bottom nav -->
        <rect x="180" y="1580" width="720" height="80" fill="#f5f5f5"/>
        
        <!-- Title -->
        <text x="540" y="200" font-family="Arial, sans-serif" font-size="64" font-weight="bold" fill="white" text-anchor="middle">${screen.title}</text>
        <text x="540" y="280" font-family="Arial, sans-serif" font-size="32" fill="rgba(255,255,255,0.8)" text-anchor="middle">${screen.subtitle}</text>
      </svg>
    `;

    await sharp(Buffer.from(screenshotSvg))
      .png()
      .toFile(path.join(OUTPUT_DIR, `${screen.name}.png`));
    console.log(`   ✅ ${screen.name}.png`);
  }

  console.log('\n✅ Tous les assets ont été générés dans le dossier:', OUTPUT_DIR);
  console.log('\n📋 Fichiers créés:');
  console.log('   • icon-512x512.png (Icône haute résolution)');
  console.log('   • feature-graphic-1024x500.png (Bannière promotionnelle)');
  console.log('   • screenshot-1-home.png');
  console.log('   • screenshot-2-payment.png');
  console.log('   • screenshot-3-tracking.png');
  console.log('   • screenshot-4-qrcode.png');
  
  console.log('\n📝 Textes pour le Play Store:\n');
  console.log('--- TITRE (50 caractères max) ---');
  console.log('Validèl - Paiement sécurisé Sénégal');
  console.log('\n--- DESCRIPTION COURTE (80 caractères max) ---');
  console.log('Achetez et vendez en toute sécurité avec Wave et Orange Money au Sénégal.');
  console.log('\n--- DESCRIPTION LONGUE ---');
  console.log(`Validèl est l'application de paiement sécurisé pour le Sénégal.

🛡️ PAIEMENT SÉCURISÉ (ESCROW)
L'argent est bloqué jusqu'à confirmation de la livraison. Acheteurs et vendeur(se)s sont protégés.

📱 MODES DE PAIEMENT
• Wave Sénégal
• Orange Money

🚚 SUIVI DE LIVRAISON
Suivez vos commandes en temps réel du paiement à la livraison.

📷 VALIDATION PAR QR CODE
Confirmation instantanée à la livraison grâce au scan QR code.

👥 POUR QUI ?
• Acheteurs : Payez en toute confiance
• Vendeur(se)s : Recevez vos paiements de façon sécurisée
• Livreurs : Gérez vos livraisons facilement

💚 FAIT AU SÉNÉGAL, POUR LE SÉNÉGAL

Téléchargez Validèl et sécurisez vos transactions dès aujourd'hui !`);
}

createPlayStoreAssets().catch(console.error);
