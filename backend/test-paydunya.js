const paydunya = require('paydunya');
require('dotenv').config();

paydunya.setup({
  masterKey: process.env.PAYDUNYA_MASTER_KEY,
  privateKey: process.env.PAYDUNYA_PRIVATE_KEY,
  publicKey: process.env.PAYDUNYA_PUBLIC_KEY,
  token: process.env.PAYDUNYA_TOKEN,
  mode: process.env.PAYDUNYA_MODE || 'test'
});

console.log('PayDunya config:', {
  masterKey: process.env.PAYDUNYA_MASTER_KEY,
  privateKey: process.env.PAYDUNYA_PRIVATE_KEY,
  publicKey: process.env.PAYDUNYA_PUBLIC_KEY,
  token: process.env.PAYDUNYA_TOKEN,
  mode: process.env.PAYDUNYA_MODE
});

try {
  const invoice = new paydunya.CheckoutInvoice();
  invoice.addItem('Test', 1, 1000, 1000);
  console.log('Invoice created OK');
} catch (e) {
  console.error('Erreur création invoice:', e);
}
