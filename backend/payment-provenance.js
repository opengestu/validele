const axios = require('axios');

// PayDunya's older handlers update orders but do not consistently settle the collection ledger.
// Verify with the provider before marking a collection as usable for routing seller payouts.
function registerPaymentProvenance(app, { db, env = process.env, http = axios }) {
  app.use(['/api/payment/webhook', '/api/paydunya/notification', '/api/paydunya/callback'], async (req, res, next) => {
    if (req.method !== 'POST') return next();
    let data = req.body?.data || req.body;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return res.status(400).json({ error: 'IPN invalide' }); } }
    const status = String(data?.status || data?.payment_status || '').toLowerCase();
    if (!['completed', 'success'].includes(status)) return next();
    const token = data?.invoice?.token || data?.invoice_token || data?.token;
    if (!token) return res.status(400).json({ error: 'Token paiement manquant' });
    try {
      const mode = ['sandbox', 'test'].includes(String(env.PAYDUNYA_MODE || '').toLowerCase()) ? 'sandbox-api' : 'api';
      const { data: confirmation } = await http.get(`https://app.paydunya.com/${mode}/v1/checkout-invoice/confirm/${encodeURIComponent(token)}`, {
        headers: { 'PAYDUNYA-MASTER-KEY': env.PAYDUNYA_MASTER_KEY, 'PAYDUNYA-PRIVATE-KEY': env.PAYDUNYA_PRIVATE_KEY, 'PAYDUNYA-TOKEN': env.PAYDUNYA_TOKEN }, timeout: 15000
      });
      if (String(confirmation.response_code) !== '00' || confirmation.status !== 'completed' || confirmation.invoice?.token !== token) throw new Error('Paiement PayDunya non confirmé');
      const { data: order, error } = await db.from('orders').select('id,total_amount').eq('token', token).single();
      if (error || !order || Number(confirmation.invoice.total_amount) !== Number(order.total_amount)) throw new Error('Commande ou montant incohérent');
      const sandbox = mode === 'sandbox-api' || String(confirmation.mode || '').toLowerCase() === 'test';
      const { error: writeError } = await db.rpc('record_paydunya_collection', { p_order: order.id, p_token: token, p_amount: Number(order.total_amount), p_sandbox: sandbox });
      if (writeError) throw new Error(writeError.message);
      // Normalize the body for the existing notification handlers; successful collection is now verified.
      req.body = { ...req.body, token, status: 'completed' };
      return next();
    } catch (error) { return res.status(503).json({ error: 'Confirmation PayDunya à réessayer', detail: error.message }); }
  });
}
module.exports = { registerPaymentProvenance };
