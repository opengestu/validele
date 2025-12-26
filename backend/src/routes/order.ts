import express from 'express';
import { PayDunyaService } from '../services/paydunya';
import { getOrderById, getUserById } from '../services/db';

const router = express.Router();

router.post('/api/order/scan', async (req, res) => {
  try {
    const { orderId } = req.body;
    console.log('[SCAN] Début déboursement pour commande', orderId);
    if (!orderId) {
      console.error('[SCAN] orderId manquant');
      return res.status(400).json({ success: false, error: 'orderId requis' });
    }
    // 1. Récupérer la commande et le vendeur
    const order = await getOrderById(orderId);
    console.log('[SCAN] Commande récupérée:', order);
    if (!order) {
      console.error('[SCAN] Commande introuvable');
      return res.status(404).json({ success: false, error: 'Commande introuvable' });
    }
    const vendeur = await getUserById(order.vendor_id);
    console.log('[SCAN] Vendeur récupéré:', vendeur);
    if (!vendeur) {
      console.error('[SCAN] Vendeur introuvable');
      return res.status(404).json({ success: false, error: 'Vendeur introuvable' });
    }
    // 2. Calculer le montant à verser (95%)
    const montantVendeur = Math.round(order.total_amount * 0.95);
    console.log(`[SCAN] Montant à verser au vendeur: ${montantVendeur} FCFA`);
    // 3. Appeler PayDunyaService pour déboursement
    const paydunya = new PayDunyaService();
    // a. Créer la facture de déboursement
    console.log('[SCAN] Appel PayDunya createDisburseInvoice...');
    const callbackUrl = process.env.PAYDUNYA_CALLBACK_URL || '';
    console.log('[SCAN] Callback URL utilisé pour PayDunya:', callbackUrl);
    const invoiceRes = await paydunya.createDisburseInvoice({
      account_alias: vendeur.phone,
      amount: montantVendeur,
      withdraw_mode: vendeur.walletType,
      callback_url: callbackUrl,
    });
    console.log('[SCAN] Réponse createDisburseInvoice:', invoiceRes);
    if (invoiceRes.response_code !== '00') {
      console.error('[SCAN] Erreur création disburse invoice:', invoiceRes.response_text);
      return res.status(500).json({ success: false, error: invoiceRes.response_text || 'Erreur création disburse invoice' });
    }
    // b. Soumettre la facture
    console.log('[SCAN] Appel PayDunya submitDisburseInvoice...');
    const submitRes = await paydunya.submitDisburseInvoice({
      disburse_invoice: invoiceRes.disburse_token,
      disburse_id: vendeur.phone,
    });
    console.log('[SCAN] Réponse submitDisburseInvoice:', submitRes);
    if (submitRes.response_code !== '00') {
      console.error('[SCAN] Erreur soumission disburse invoice:', submitRes.response_text);
      return res.status(500).json({ success: false, error: submitRes.response_text || 'Erreur soumission disburse invoice' });
    }
    // 4. Succès
    console.log('[SCAN] Déboursement réussi pour commande', orderId);
    return res.json({ success: true, paydunya: submitRes });
  } catch (err: unknown) {
    let errorMessage = 'Erreur inconnue';
    if (err instanceof Error) {
      errorMessage = err.message;
    }
    console.error('[SCAN] Exception dans /api/order/scan:', errorMessage, err);
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

export default router; 