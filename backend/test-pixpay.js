// Test PixPay (Wave SN) - Crédit téléphonique
const axios = require('axios');

// ========================================
// CONFIGURATION - À REMPLIR
// ========================================
const CONFIG = {
  // Environnement
  mode: 'production', // 'sandbox' ou 'production'
  
  // URLs
  sandbox_url: 'https://standbox-api.pixelinnov.net/api_v1/transaction/airtime',
  production_url: 'https://proxy-coreapi.pixelinnov.net/api_v1/transaction/airtime',
  
  // Credentials (fournis par PixPay)
  api_key: 'PIX_bc95d417-096c-4a0a-a35e-b325bbe292cc', // À remplacer
  service_id: 214, // 1=Orange Money (vérifie dans ta doc PixPay)
  business_name_id: 'TON_BUSINESS_ID', // ← REMPLACE SI TU L'AS REÇU
  
  // URLs de callback (pour tester, utilise webhook.site)
  ipn_url: 'https://webhook.site/7e3c52bb-0fed-453f-8b93-61172dedd4b5', // https://webhook.site pour tester
};

// ========================================
// FONCTION DE TEST
// ========================================
async function testPixPayAirtime(amount, destination, customData = null) {
  const url = CONFIG.mode === 'sandbox' ? CONFIG.sandbox_url : CONFIG.production_url;
  
  const payload = {
    amount: parseInt(amount), // Montant en FCFA
    destination: String(destination), // Numéro du bénéficiaire
    api_key: CONFIG.api_key,
    ipn_url: CONFIG.ipn_url,
    service_id: CONFIG.service_id,
    custom_data: customData || `test_${Date.now()}`
  };
  
  // Ajouter business_name_id si fourni
  if (CONFIG.business_name_id) {
    payload.business_name_id = CONFIG.business_name_id;
  }

  console.log('\n🔵 [PIXPAY TEST] Environnement:', CONFIG.mode.toUpperCase());
  console.log('🔵 [PIXPAY TEST] URL:', url);
  console.log('🔵 [PIXPAY TEST] Payload:', JSON.stringify(payload, null, 2));
  console.log('\n⏳ Envoi de la requête...\n');

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 secondes
    });

    console.log('✅ [PIXPAY] Réponse reçue:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('\n📊 Détails de la transaction:');
    console.log('   - Transaction ID:', response.data.data?.transaction_id);
    console.log('   - État:', response.data.data?.state);
    console.log('   - Montant:', response.data.data?.amount, 'FCFA');
    console.log('   - Destination:', response.data.data?.destination);
    console.log('   - Message:', response.data.message);
    console.log('\n💡 Vérifiez votre IPN URL pour le statut final:', CONFIG.ipn_url);
    
    return response.data;

  } catch (error) {
    console.error('\n❌ [PIXPAY] Erreur:');
    if (error.response) {
      console.error('   - Status:', error.response.status);
      console.error('   - Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('   - Pas de réponse du serveur');
      console.error('   - Request:', error.request);
    } else {
      console.error('   - Message:', error.message);
    }
    throw error;
  }
}

// ========================================
// EXEMPLES D'UTILISATION
// ========================================

// Test 1 : Crédit de 1000 FCFA
async function test1() {
  console.log('\n� TEST 1: Crédit de 1000 FCFA');
  await testPixPayAirtime(400, '777804136', 'test_400_fcfa');
}

// Test 2 : Crédit de 500 FCFA
async function test2() {
  console.log('\n� TEST 2: Crédit de 500 FCFA');
  await testPixPayAirtime(500, '777804136', 'test_500_fcfa');
}

// ========================================
// LANCER LES TESTS
// ========================================

async function runTests() {
  console.log('═══════════════════════════════════════════');
  console.log('  TEST PIXPAY (WAVE SN) - CRÉDIT TÉLÉPHONE');
  console.log('═══════════════════════════════════════════');
  
  // Vérification de la configuration
  if (CONFIG.api_key === 'VOTRE_CLE_API') {
    console.error('\n❌ ERREUR: Vous devez configurer votre API_KEY dans le fichier');
    console.log('\n📝 Étapes pour tester:');
    console.log('   1. Obtenez vos credentials de PixPay (api_key, service_id)');
    console.log('   2. Modifiez CONFIG.api_key et CONFIG.service_id dans le fichier');
    console.log('   3. Créez une URL IPN de test sur https://webhook.site');
    console.log('   4. Collez l\'URL dans CONFIG.ipn_url');
    console.log('   5. Relancez: node test-pixpay.js\n');
    return;
  }

  try {
    // Décommentez les tests que vous voulez exécuter
    await test1();
    // await test2();
    
    console.log('\n✅ Tests terminés avec succès');
  } catch (error) {
    console.error('\n❌ Les tests ont échoué');
  }
}

// Si exécuté directement (node test-pixpay.js)
if (require.main === module) {
  runTests();
}

// Export pour utilisation dans d'autres modules
module.exports = { testPixPayAirtime, CONFIG };
