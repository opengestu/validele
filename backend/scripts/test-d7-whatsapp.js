// Test réel D7 WhatsApp.
// Usage (depuis le dossier backend) :  node scripts/test-d7-whatsapp.js 221XXXXXXXXX
// (le destinataire doit avoir écrit au numéro business dans les dernières 24h)

const path = require('path');

// Charger le .env du backend, peu importe le dossier depuis lequel on lance le script.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const d7 = require('../direct7.js');

const recipient = process.argv[2];

if (!recipient) {
  console.error('❌ Donne ton numéro : node scripts/test-d7-whatsapp.js 221XXXXXXXXX');
  process.exit(1);
}

console.log('— Config —');
console.log('DIRECT7_API_KEY présent :', Boolean(process.env.DIRECT7_API_KEY));
console.log('WHATSAPP_BOT_NUMBER     :', process.env.WHATSAPP_BOT_NUMBER || '(vide)');
console.log('Destinataire            :', recipient);
console.log('');

(async () => {
  try {
    console.log('▶ Envoi texte simple...');
    const textRes = await d7.sendWhatsApp(recipient, 'Test Validèl ✅ — connexion D7 WhatsApp OK.');
    console.log('  ✓ texte envoyé :', JSON.stringify(textRes.data));

    console.log('▶ Envoi interactif (boutons)...');
    const btnRes = await d7.sendWhatsAppButtons(
      recipient,
      'Ceci est un test de boutons interactifs Validèl.',
      [
        { id: 'test:oui', title: 'Oui' },
        { id: 'test:non', title: 'Non' },
      ]
    );
    console.log('  ✓ boutons envoyés :', JSON.stringify(btnRes.data));

    console.log('\n🎉 Tout est passé. Vérifie la réception sur ton WhatsApp.');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Échec :', err.message);
    process.exit(1);
  }
})();
