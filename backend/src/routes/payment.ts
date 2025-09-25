import { Router } from 'express';
import { PayDunyaService } from '../services/paydunya';
import { Request, Response } from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { supabase } = require('../../supabase');

const router = Router();
const payDunyaService = new PayDunyaService();

// Créer une facture
router.post('/invoice', async (req: Request, res: Response) => {
  try {
    const { amount, description, storeName } = req.body;
    const response = await payDunyaService.createInvoice({
      invoice: {
        total_amount: amount,
        description,
      },
      store: {
        name: storeName,
      }
    });

    res.json(response);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    res.status(500).json({
      status: 'failed',
      message: error.message
    });
  }
});

// Effectuer un paiement
router.post('/payment', async (req: Request, res: Response) => {
  try {
    const { token, phone_number, customer_email, password } = req.body;
    const response = await payDunyaService.makePayment(token, {
      phone_number,
      customer_email,
      password,
    });

    res.json(response);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    res.status(500).json({
      status: 'failed',
      message: error.message
    });
  }
});

// Notification PayDunya (webhook)
router.post('/notification', async (req: Request, res: Response) => {
  console.log('Notification PayDunya reçue:', req.body);

  const token = req.body?.data?.invoice?.token;
  const status = req.body?.data?.status;

  if (token && status === 'completed') {
    // Met à jour la commande correspondante (par token)
    const { error } = await supabase
      .from('orders')
      .update({ status: 'paid' })
      .eq('token', token);

    if (!error) {
      console.log(`Commande avec token ${token} marquée comme payée.`);
      res.status(200).send('Commande mise à jour');
    } else {
      console.error('Erreur lors de la mise à jour de la commande:', error);
      res.status(500).send('Erreur lors de la mise à jour');
    }
  } else {
    res.status(200).send('Notification ignorée');
  }
});

router.post('/create-order-and-invoice', async (req: Request, res: Response) => {
  try {
    const { buyer_id, product_id, vendor_id, total_amount, payment_method, buyer_phone, delivery_address, description, storeName } = req.body;

    // Générer un order_code unique CMD0001, CMD0002, ...
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('order_code')
      .order('created_at', { ascending: true });
    let nextNumber = 1;
    if (orders && orders.length > 0) {
      const max = orders.reduce((acc, o) => {
        const match = o.order_code && o.order_code.match(/^CMD(\d{4})$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          return num > acc ? num : acc;
        }
        return acc;
      }, 0);
      nextNumber = max + 1;
    }
    if (nextNumber > 9999) throw new Error('Limite de 9999 commandes atteinte');
    const order_code = `CMD${nextNumber.toString().padStart(4, '0')}`.toUpperCase();

    // 1. Créer la commande (statut pending)
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        buyer_id,
        product_id,
        vendor_id,
        total_amount,
        status: 'pending',
        payment_method,
        buyer_phone,
        delivery_address,
        order_code,
      })
      .select()
      .single();

    if (orderError || !order) {
      return res.status(400).json({ status: 'failed', message: orderError?.message || "Impossible de créer la commande" });
    }

    // 2. Générer la facture PayDunya
    const payDunyaService = new PayDunyaService();
    const invoiceResponse = await payDunyaService.createInvoice({
      invoice: {
        total_amount,
        description,
      },
      store: {
        name: storeName,
      }
    });

    if (invoiceResponse.status !== 'success' || !invoiceResponse.transaction_id) {
      return res.status(400).json({ status: 'failed', message: invoiceResponse.message || "Erreur PayDunya" });
    }

    // 3. Mettre à jour la commande avec le token PayDunya et le qr_code (qui sera le order_code)
    await supabase
      .from('orders')
      .update({ token: invoiceResponse.transaction_id, qr_code: order_code })
      .eq('id', order.id);

    // 4. Retourner l'URL PayDunya, le token, le PDF et l'order_id au frontend
    return res.json({ status: 'success', redirect_url: invoiceResponse.redirect_url, token: invoiceResponse.transaction_id, receipt_url: invoiceResponse.receipt_url, order_id: order.id });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error('Erreur create-order-and-invoice:', error);
    return res.status(500).json({ status: 'failed', message: error.message });
  }
});

// Paiement direct SoftPay Wave Sénégal
router.post('/softpay/wave', async (req: Request, res: Response) => {
  try {
    const { fullName, email, phone, payment_token } = req.body;
    const result = await payDunyaService.softPayWaveSenegal({
      fullName,
      email,
      phone,
      payment_token
    });
    res.json(result);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Paiement direct SoftPay Orange Money Sénégal
router.post('/softpay/orange', async (req: Request, res: Response) => {
  try {
    const { customer_name, customer_email, phone_number, invoice_token, api_type, authorization_code } = req.body;
    const result = await payDunyaService.softPayOrangeMoneySenegal({
      customer_name,
      customer_email,
      phone_number,
      invoice_token,
      api_type,
      authorization_code
    });
    res.json(result);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
