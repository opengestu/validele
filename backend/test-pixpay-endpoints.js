// Test des endpoints PixPay du backend
const axios = require('axios');

const API_URL = 'http://localhost:3001'; // Change si backend sur autre port

// Test 1: Initier un paiement (collecte)
async function testInitiatePayment() {
  console.log('\n📱 TEST 1: Initier un paiement Orange Money\n');
  
  try {
    const response = await axios.post(`${API_URL}/api/payment/pixpay/initiate`, {
      amount: 1000,
      phone: '+221774254729',
      orderId: `ORDER_TEST_${Date.now()}`,
      customData: {
        buyer_name: 'Test User',
        product: 'Test Product'
      }
    });

    console.log('✅ Réponse:', JSON.stringify(response.data, null, 2));
    
    if (response.data.sms_link) {
      console.log('\n📲 Lien SMS pour payer:', response.data.sms_link);
    }
    
    return response.data.transaction_id;

  } catch (error) {
    console.error('❌ Erreur:', error.response?.data || error.message);
    throw error;
  }
}

// Test 2: Envoyer de l'argent (payout)
async function testPayout() {
  console.log('\n💸 TEST 2: Envoyer de l\'argent (payout)\n');
  
  try {
    const response = await axios.post(`${API_URL}/api/payment/pixpay/payout`, {
      amount: 500,
      phone: '+221774254729',
      orderId: `PAYOUT_TEST_${Date.now()}`,
      type: 'vendor_payment'
    });

    console.log('✅ Réponse:', JSON.stringify(response.data, null, 2));
    
    return response.data.transaction_id;

  } catch (error) {
    console.error('❌ Erreur:', error.response?.data || error.message);
    throw error;
  }
}

// Test 3: Simuler un webhook IPN
async function testWebhook(transactionId) {
  console.log('\n🔔 TEST 3: Simuler un webhook IPN (succès)\n');
  
  try {
    const ipnData = {
      transaction_id: transactionId || 'PIX_TEST_123',
      amount: 1000,
      destination: '221774254729',
      state: 'SUCCESS',
      response: 'operation success',
      error: null,
      provider_id: 'test_provider_id_123',
      custom_data: JSON.stringify({
        order_id: 'ORDER_TEST_123'
      })
    };

    const response = await axios.post(`${API_URL}/api/payment/pixpay-webhook`, ipnData);

    console.log('✅ Réponse webhook:', JSON.stringify(response.data, null, 2));

  } catch (error) {
    console.error('❌ Erreur:', error.response?.data || error.message);
    throw error;
  }
}

// Lancer tous les tests
async function runAllTests() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  TESTS ENDPOINTS PIXPAY');
  console.log('═══════════════════════════════════════════════════');
  
  try {
    // Test 1: Initier un paiement
    const transactionId = await testInitiatePayment();
    
    console.log('\n⏸️  Attente 3 secondes...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test 2: Payout
    await testPayout();
    
    console.log('\n⏸️  Attente 3 secondes...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test 3: Webhook
    await testWebhook(transactionId);
    
    console.log('\n═══════════════════════════════════════════════════');
    console.log('✅ Tous les tests ont réussi !');
    console.log('═══════════════════════════════════════════════════\n');

  } catch (error) {
    console.log('\n═══════════════════════════════════════════════════');
    console.error('❌ Les tests ont échoué');
    console.log('═══════════════════════════════════════════════════\n');
  }
}

// Si exécuté directement
if (require.main === module) {
  runAllTests();
}

module.exports = { testInitiatePayment, testPayout, testWebhook };
