/*
Simple smoke test for admin payout flow (notify admin -> admin payout)
Usage:
  ADMIN_URL=http://localhost:5000 ADMIN_TOKEN=<token> ORDER_ID=<orderId> node admin-payout-flow.js

If ADMIN_TOKEN is not provided, use ADMIN_PROFILE_ID and ADMIN_PIN to get a token via /api/admin/login-local
*/

const axios = require('axios');

const API = process.env.ADMIN_URL || 'http://localhost:5000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const ADMIN_PROFILE_ID = process.env.ADMIN_PROFILE_ID;
const ADMIN_PIN = process.env.ADMIN_PIN;
const ORDER_ID = process.env.ORDER_ID;

if (!ORDER_ID) {
  console.error('ORDER_ID env is required');
  process.exit(1);
}

async function getAdminToken() {
  if (ADMIN_TOKEN) return ADMIN_TOKEN;
  if (ADMIN_PROFILE_ID && ADMIN_PIN) {
    const res = await axios.post(`${API}/api/admin/login-local`, { profileId: ADMIN_PROFILE_ID, pin: ADMIN_PIN });
    return res.data.token;
  }
  throw new Error('No admin token or credentials provided');
}

(async () => {
  try {
    console.log('1) Notify admin of delivery request');
    const notifyRes = await axios.post(`${API}/api/notify/admin-delivery-request`, { orderId: ORDER_ID });
    console.log('notify response:', notifyRes.data);

    const token = await getAdminToken();
    console.log('Got admin token, calling payout');

    const payoutRes = await axios.post(`${API}/api/admin/payout-order`, { orderId: ORDER_ID }, { headers: { Authorization: `Bearer ${token}` } });
    console.log('payout response:', payoutRes.data);

    console.log('2) Check transaction list as admin');
    const txRes = await axios.get(`${API}/api/admin/transactions`, { headers: { Authorization: `Bearer ${token}` } });
    const found = txRes.data.transactions.find(t => String(t.order_id) === String(ORDER_ID));
    if (found) console.log('Transaction found:', found);
    else console.warn('No transaction found yet for order:', ORDER_ID);

    console.log('Test complete');
  } catch (err) {
    console.error('Test failed:', err?.response?.data || err.message || err);
    process.exit(2);
  }
})();