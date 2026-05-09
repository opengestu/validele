// Test PixPay Wave - Paiement client
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
  
  // Credentials Wave
  api_key: process.env.PIXPAY_API_KEY || 'PIX_bc95d417-096c-4a0a-a35e-b325bbe292cc',
  service_id: 79, // Service ID fixe pour générer le lien Wave (79)
  business_name_id: process.env.PIXPAY_WAVE_BUSINESS_NAME_ID || 'am-22822bk801d0t',
  
  // URLs de callback
  ipn_url: 'https://validele.onrender.com/api/payment/pixpay-webhook',
  redirect_url: 'https://validele.onrender.com/payment-success',
  redirect_error_url: 'https://validele.onrender.com/payment-error',
};

// ========================================
// FONCTION DE TEST WAVE
// ========================================
async function testPixPayWave(amount, destination, orderId = null) {
  const url = CONFIG.production_url;
  let normalizedDestination = String(destination || '').replace(/[\s\-\(\)]/g, '');
  if (normalizedDestination.startsWith('+')) normalizedDestination = normalizedDestination.substring(1);
  if (normalizedDestination.startsWith('0')) normalizedDestination = `221${normalizedDestination.substring(1)}`;
  if (!normalizedDestination.startsWith('221')) normalizedDestination = `221${normalizedDestination}`;
  
  const payload = {
    amount: parseInt(amount),
    destination: normalizedDestination,
    api_key: CONFIG.api_key,
    service_id: CONFIG.service_id,
    business_name_id: CONFIG.business_name_id,
    ipn_url: CONFIG.ipn_url,
    redirect_url: CONFIG.redirect_url,
    redirect_error_url: CONFIG.redirect_error_url,
    custom_data: JSON.stringify({
      order_id: orderId || `TEST_${Date.now()}`,
      payment_method: 'wave',
      test: true
    })
  };

  console.log('\n🔵 [PIXPAY WAVE TEST] Configuration:');
  console.log('   - Service ID:', CONFIG.service_id);
  console.log('   - Business Name ID:', CONFIG.business_name_id);
  console.log('   - IPN URL:', CONFIG.ipn_url);
  console.log('\n🔵 [PIXPAY WAVE TEST] Payload:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('\n⏳ Envoi de la requête...\n');

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    console.log('✅ [PIXPAY WAVE] Réponse reçue:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('\n📊 Détails de la transaction:');
    console.log('   - Transaction ID:', response.data.data?.transaction_id);
    console.log('   - État:', response.data.data?.state);
    console.log('   - Montant:', response.data.data?.amount, 'FCFA');
    console.log('   - Destination:', response.data.data?.destination);
    console.log('   - Message:', response.data.message);
    console.log('\n💡 Vérifiez le webhook pour le statut final');
    
    return response.data;

  } catch (error) {
    console.error('\n❌ [PIXPAY WAVE] Erreur:');
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
// TEST WAVE
// ========================================
async function testWavePayment() {
  console.log('\n💙 TEST: Paiement Wave de 500 FCFA');
  await testPixPayWave(500, '774254729', 'TEST_ORDER_001');
}

// ========================================
// LANCER LE TEST
// ========================================
async function runTests() {
  console.log('═══════════════════════════════════════════');
  console.log('  TEST PIXPAY WAVE - PAIEMENT CLIENT');
  console.log('═══════════════════════════════════════════');
  
  // Vérification de la configuration
  if (!CONFIG.business_name_id || CONFIG.business_name_id === 'am-22822bk801d0t') {
    console.log('\n✅ Configuration Wave détectée');
  }

  try {
    await testWavePayment();
    
    console.log('\n✅ Test terminé avec succès');
    console.log('\n📱 Prochaines étapes:');
    console.log('   1. Vérifiez votre téléphone Wave pour valider le paiement');
    console.log('   2. Surveillez les logs Render pour le webhook IPN');
    console.log('   3. Le paiement expire dans 15 minutes');
  } catch (error) {
    console.error('\n❌ Le test a échoué');
  }
}

// Si exécuté directement
if (require.main === module) {
  runTests();
}

// Export
module.exports = { testPixPayWave, CONFIG };
