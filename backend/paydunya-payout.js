const axios = require('axios');

const API = 'https://app.paydunya.com/api/v2/disburse';
function createPaydunyaPayout({ env = process.env, http = axios } = {}) {
  function configured() {
    return ['PAYDUNYA_MASTER_KEY', 'PAYDUNYA_PRIVATE_KEY', 'PAYDUNYA_TOKEN', 'PAYOUT_WEBHOOK_SECRET'].every(key => !!env[key])
      && !['sandbox', 'test'].includes(String(env.PAYDUNYA_MODE || 'prod').toLowerCase())
      && !String(env.PAYDUNYA_PRIVATE_KEY || '').startsWith('test_');
  }
  function headers() {
    if (!configured()) throw new Error('Déboursement PayDunya non configuré (clés production et secret IPN requis)');
    return { 'Content-Type': 'application/json', 'PAYDUNYA-MASTER-KEY': env.PAYDUNYA_MASTER_KEY, 'PAYDUNYA-PRIVATE-KEY': env.PAYDUNYA_PRIVATE_KEY, 'PAYDUNYA-TOKEN': env.PAYDUNYA_TOKEN };
  }
  async function request(endpoint, data) {
    return (await http.post(`${API}/${endpoint}`, data, { headers: headers(), timeout: 20000 })).data;
  }
  function statusResult(data, token, amount) {
    if (String(data.response_code) !== '00' || data.token !== token || Number(data.amount) !== Number(amount)) throw new Error('Vérification PayDunya incohérente');
    const state = { success: 'SUCCESSFUL', failed: 'FAILED', pending: 'PROCESSING', created: 'PROCESSING' }[String(data.status).toLowerCase()];
    if (!state) throw new Error('Statut PayDunya inconnu');
    return { state, token, transaction_id: `paydunya:${token}`, provider_transaction_id: data.transaction_id || null };
  }
  async function checkStatus(dispatch) {
    if (!dispatch.provider_reference) throw new Error('Token de déboursement PayDunya manquant');
    return statusResult(await request('check-status', { disburse_invoice: dispatch.provider_reference }), dispatch.provider_reference, dispatch.amount);
  }
  async function sendMoney(params) {
    let token;
    // Creating an invoice does not submit a disbursement. Failures here cannot debit the vendor payout.
    try {
      const phone = String(params.phone).replace(/\D/g, '').replace(/^221/, '');
      if (!/^7\d{8}$/.test(phone)) throw new Error('Numéro Sénégal invalide');
      if (!Number.isSafeInteger(Number(params.amount)) || Number(params.amount) <= 0) throw new Error('Montant invalide');
      const withdrawMode = { 'wave-senegal': 'wave-senegal', 'orange-senegal': 'orange-money-senegal' }[params.walletType];
      if (!withdrawMode) throw new Error('Wallet non pris en charge');
      const callback = new URL('/api/payment/paydunya-payout-webhook', env.PAYOUT_IPN_BASE_URL || env.PIXPAY_IPN_BASE_URL || 'https://validele.onrender.com');
      if (callback.protocol !== 'https:') throw new Error('Callback HTTPS requis');
      callback.searchParams.set('payout_token', env.PAYOUT_WEBHOOK_SECRET || '');
      callback.searchParams.set('attempt_id', params.payoutAttemptId);
      const invoice = await request('get-invoice', { account_alias: phone, amount: Number(params.amount), withdraw_mode: withdrawMode, callback_url: callback.toString() });
      if (String(invoice.response_code) !== '00' || !invoice.disburse_token) throw new Error(invoice.response_text || 'Création du déboursement refusée');
      token = invoice.disburse_token;
      // A process crash after submit must remain recoverable using this exact token.
      await params.recordReference(token);
    } catch (error) {
      return { success: false, uncertain: false, message: error.message };
    }
    try {
      await request('submit-invoice', { disburse_invoice: token, disburse_id: params.payoutAttemptId });
    } catch (_) {
      // A submit error is NOT evidence of failure. Check the same token, never resubmit here.
    }
    try {
      const verified = await checkStatus({ provider_reference: token, amount: params.amount });
      return { success: verified.state !== 'FAILED', uncertain: false, verified_state: verified.state, transaction_id: verified.transaction_id, state: verified.state };
    } catch (_) {
      return { success: false, uncertain: true, transaction_id: `paydunya:${token}`, message: 'Déboursement soumis ; résultat à vérifier avec le même token' };
    }
  }
  return { configured, sendMoney, checkStatus };
}
module.exports = { createPaydunyaPayout };
