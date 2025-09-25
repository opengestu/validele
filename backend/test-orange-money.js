const axios = require('axios');

const PAYDUNYA_MASTER_KEY = 'DmGws1Xi-2iJl-JGN4-Vni9-JI1GOWsMjTVs';
const PAYDUNYA_PRIVATE_KEY = 'live_private_QriHfl3vzV095zgYTQ6FrijJRzb';
const PAYDUNYA_TOKEN = 'hUZRPNA93dz0WtBQWoik';

const testModes = [
  'orange-money-senegal',
  'orange_senegal', 
  'orange-money',
  'orange'
];

async function testOrangeMoneyMode(mode) {
  try {
    console.log(`\n=== Test mode: ${mode} ===`);
    
    const response = await axios.post(
      'https://app.paydunya.com/api/v2/disburse/get-invoice',
      {
        account_alias: '774254729',
        amount: 100,
        withdraw_mode: mode,
        callback_url: 'https://34624d435147.ngrok-free.app/api/paydunya/notification'
      },
      {
        headers: {
          'PAYDUNYA-MASTER-KEY': PAYDUNYA_MASTER_KEY,
          'PAYDUNYA-PRIVATE-KEY': PAYDUNYA_PRIVATE_KEY,
          'PAYDUNYA-TOKEN': PAYDUNYA_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );
    
    console.log('✅ Succès:', response.data);
    return { mode, success: true, data: response.data };
  } catch (error) {
    console.log('❌ Erreur:', error.response?.data || error.message);
    return { mode, success: false, error: error.response?.data || error.message };
  }
}

async function runTests() {
  console.log('🧪 Test des modes Orange Money PayDunya...\n');
  
  const results = [];
  
  for (const mode of testModes) {
    const result = await testOrangeMoneyMode(mode);
    results.push(result);
    
    // Pause entre les tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n📊 Résultats:');
  results.forEach(result => {
    if (result.success) {
      console.log(`✅ ${result.mode}: SUCCÈS`);
    } else {
      console.log(`❌ ${result.mode}: ÉCHEC - ${result.error?.response_text || result.error}`);
    }
  });
  
  const workingModes = results.filter(r => r.success);
  if (workingModes.length > 0) {
    console.log(`\n🎉 Mode(s) fonctionnel(s): ${workingModes.map(r => r.mode).join(', ')}`);
  } else {
    console.log('\n⚠️ Aucun mode Orange Money ne fonctionne. Vérifiez la configuration PayDunya.');
  }
}

runTests().catch(console.error); 