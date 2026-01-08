// Test PixPay Orange Money - Payout vendeur
const axios = require('axios');
require('dotenv').config();

// ========================================
// CONFIGURATION
// ========================================
const CONFIG = {
  // Environnement
  mode: 'production',
  
  // URLs
  production_url: 'https://proxy-coreapi.pixelinnov.net/api_v1/transaction/airtime',
  
  // Credentials Orange Money
  api_key: process.env.PIXPAY_API_KEY || 'PIX_bc95d417-096c-4a0a-a35e-b325bbe292cc',
  service_id: 214, // Orange Money PAYOUT (IN_ORANGE_MONEY_SN)
  
  // URLs de callback
  ipn_url: 'https://validele.onrender.com/api/payment/pixpay-webhook',
};

// ========================================
// FONCTION DE TEST ORANGE MONEY PAYOUT
// ========================================
async function testOrangeMoneyPayout(amount, destination, orderId = null) {
  const url = CONFIG.production_url;
  
  const payload = {
    amount: parseInt(amount),
    destination: String(destination),
    api_key: CONFIG.api_key,
    service_id: CONFIG.service_id,
    ipn_url: CONFIG.ipn_url,
    custom_data: JSON.stringify({
      order_id: orderId || `TEST_ORANGE_PAYOUT_${Date.now()}`,
      payment_method: 'orange-money',
      type: 'vendor_payout',
      test: true
    })
  };

  console.log('\n🟠 [PIXPAY ORANGE PAYOUT TEST] Configuration:');
  console.log('   - Service ID:', CONFIG.service_id, '(Orange Money PAYOUT)');
  console.log('   - IPN URL:', CONFIG.ipn_url);
  console.log('\n🟠 [PIXPAY ORANGE PAYOUT TEST] Payload:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('\n⏳ Envoi de la requête...\n');

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    console.log('✅ [PIXPAY ORANGE] Réponse reçue:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('\n📊 Détails de la transaction:');
    console.log('   - Transaction ID:', response.data.data?.transaction_id);
    console.log('   - État:', response.data.data?.state);
    console.log('   - Montant:', response.data.data?.amount, 'FCFA');
    console.log('   - Destination:', response.data.data?.destination);
    console.log('   - Message:', response.data.message);
    console.log('   - SMS Link:', response.data.data?.sms_link || 'N/A');
    console.log('\n💡 Vérifiez le webhook pour le statut final');
    
    return response.data;

  } catch (error) {
    console.error('\n❌ [PIXPAY ORANGE] Erreur:');
    if (error.response) {
      console.error('   - Status:', error.response.status);
      console.error('   - Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('   - Pas de réponse du serveur');
    } else {
      console.error('   - Message:', error.message);
    }
    throw error;
  }
}

// ========================================
// TEST ORANGE MONEY PAYOUT
// ========================================
async function testOrangePayout() {
  console.log('\n🟠 TEST: Payout Orange Money de 100 FCFA');
  // Remplacez par le numéro Orange Money du vendeur test
  await testOrangeMoneyPayout(100, '774254729', 'TEST_VENDOR_PAYOUT_001');
}

// ========================================
// LANCER LE TEST
// ========================================
async function runTests() {
  console.log('═══════════════════════════════════════════');
  console.log('  TEST PIXPAY ORANGE MONEY - PAYOUT VENDEUR');
  console.log('═══════════════════════════════════════════');
  
  console.log('\n⚠️  IMPORTANT: Remplacez le numéro de téléphone dans testOrangePayout()');
  console.log('    avec un vrai numéro Orange Money avant de lancer le test\n');

  try {
    await testOrangePayout();
    
    console.log('\n✅ Test terminé avec succès');
    console.log('\n📱 Prochaines étapes:');
    console.log('   1. Vérifiez si une validation SMS est requise');
    console.log('   2. Surveillez les logs Render pour le webhook IPN');
    console.log('   3. Vérifiez le compte Orange Money du destinataire');
  } catch (error) {
    console.error('\n❌ Le test a échoué');
  }
}

// Si exécuté directement
if (require.main === module) {
  runTests();
}

// Export
module.exports = { testOrangeMoneyPayout, CONFIG };
