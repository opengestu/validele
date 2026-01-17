import { Router } from 'express';
import { PayDunyaService } from '../services/paydunya';
import { randomBytes } from 'crypto';
import { Request, Response } from 'express';
import { getSupabaseClient } from '../services/db';

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
  try {
    console.log('Notification PayDunya reçue:', req.body);

    const supabase = getSupabaseClient();
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
        return res.status(200).send('Commande mise à jour');
      }

      console.error('Erreur lors de la mise à jour de la commande:', error);
      return res.status(500).send('Erreur lors de la mise à jour');
    }

    return res.status(200).send('Notification ignorée');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    return res.status(500).json({
      status: 'failed',
      message: error?.message || 'Erreur webhook PayDunya'
    });
  }
});

router.post('/create-order-and-invoice', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseClient();
    const { buyer_id, product_id, vendor_id, total_amount, payment_method, buyer_phone, delivery_address, description, storeName } = req.body;

    // Générer un order_code au format demandé: 'C' + 2 lettres + 4 chiffres (ex: CAB1234)
    const randLetter = () => String.fromCharCode(65 + Math.floor(Math.random()*26));
    const randLetters = (n: number) => Array.from({length:n}).map(() => randLetter()).join('');
    const randDigits = (n: number) => Math.floor(Math.random()*Math.pow(10,n)).toString().padStart(n,'0');
    const order_code = `C${randLetters(2)}${randDigits(4)}`;
    // secure token (8 bytes hex => 16 chars) stocké en qr_code
    const tokenRaw = randomBytes(8).toString('hex').toUpperCase();

    // 1. Créer la commande et 2. Générer la facture PayDunya EN PARALLÈLE
    const payDunyaService = new PayDunyaService();
    
    const [orderResult, invoiceResponse] = await Promise.all([
      // Créer la commande (statut pending) et inclure le token sécurisé comme qr_code
      supabase
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
          qr_code: tokenRaw,
        })
        .select()
        .single(),
      
      // Générer la facture PayDunya en même temps
      payDunyaService.createInvoice({
        invoice: {
          total_amount,
          description,
        },
        store: {
          name: storeName,
        }
      })
    ]);

    const { data: order, error: orderError } = orderResult;

    if (orderError || !order) {
      return res.status(400).json({ status: 'failed', message: orderError?.message || "Impossible de créer la commande" });
    }

    if (invoiceResponse.status !== 'success' || !invoiceResponse.transaction_id) {
      return res.status(400).json({ status: 'failed', message: invoiceResponse.message || "Erreur PayDunya" });
    }

    // 3. Mettre à jour la commande avec le token PayDunya (non bloquant pour la réponse)
    supabase
      .from('orders')
      .update({ token: invoiceResponse.transaction_id, qr_code: tokenRaw })
      .eq('id', order.id)
      .then(() => console.log('Token mis à jour pour commande', order.id))
      .catch((err: Error) => console.error('Erreur update token:', err));

    // 4. Retourner immédiatement (inclure qr_code généré pour usage côté frontend)
    return res.json({ status: 'success', redirect_url: invoiceResponse.redirect_url, token: invoiceResponse.transaction_id, receipt_url: invoiceResponse.receipt_url, order_id: order.id, qr_code: tokenRaw });
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
