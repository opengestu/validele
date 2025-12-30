// backend/server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();
const fs = require('fs');
const https = require('https');
const { sendOTP, verifyOTP } = require('./direct7');

const app = express();

process.on('uncaughtException', function (err) {
  console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', function (reason, p) {
  console.error('UNHANDLED REJECTION:', reason);
});

app.use(express.json({ type: '*/*' })); // Force le parsing JSON même si le header n'est pas exactement application/json
app.use(cors());
app.use(express.urlencoded({ extended: true }));

// Middleware de gestion d'erreur globale pour attraper les erreurs de parsing JSON
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('Bad JSON:', err.message);
    return res.status(400).json({ success: false, message: 'Requête JSON invalide.' });
  }
  next();
});

// Endpoint de test
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is running!' });
});

// ==========================================
// ENDPOINTS OTP (Direct7Networks)
// ==========================================

// Envoyer un code OTP
app.post('/api/otp/send', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, error: 'Numéro de téléphone requis' });
    }

    // Formater le numéro
    let formattedPhone = phone.replace(/[\s\-\(\)]/g, '');
    if (!formattedPhone.startsWith('+')) {
      if (formattedPhone.startsWith('221')) {
        formattedPhone = '+' + formattedPhone;
      } else if (formattedPhone.startsWith('0')) {
        formattedPhone = '+221' + formattedPhone.substring(1);
      } else {
        formattedPhone = '+221' + formattedPhone;
      }
    }

    // Valider le format sénégalais
    if (!formattedPhone.match(/^\+221[0-9]{9}$/)) {
      return res.status(400).json({ success: false, error: 'Numéro sénégalais invalide' });
    }

    console.log(`[OTP] Demande d'envoi pour: ${formattedPhone}`);

    await sendOTP(formattedPhone);

    res.json({ success: true, message: 'Code envoyé', phone: formattedPhone });
  } catch (error) {
    console.error('[OTP] Erreur envoi:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Vérifier un code OTP
app.post('/api/otp/verify', async (req, res) => {
  try {
    const { phone, code } = req.body;

    if (!phone || !code) {
      return res.status(400).json({ success: false, error: 'Numéro et code requis' });
    }

    // Formater le numéro
    let formattedPhone = phone.replace(/[\s\-\(\)]/g, '');
    if (!formattedPhone.startsWith('+')) {
      if (formattedPhone.startsWith('221')) {
        formattedPhone = '+' + formattedPhone;
      } else {
        formattedPhone = '+221' + formattedPhone;
      }
    }

    console.log(`[OTP] Vérification pour: ${formattedPhone}, code: ${code}`);

    const result = await verifyOTP(formattedPhone, code);

    if (result.valid) {
      res.json({ success: true, valid: true });
    } else {
      res.status(400).json({ success: false, valid: false, error: result.error });
    }
  } catch (error) {
    console.error('[OTP] Erreur vérification:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================

// Utilisation de l'API PayDunya en production ou sandbox
const PAYDUNYA_MODE = process.env.PAYDUNYA_MODE || 'prod';
const PAYDUNYA_API_BASE = PAYDUNYA_MODE === 'sandbox'
  ? 'https://app.paydunya.com/sandbox-api/v1'
  : 'https://app.paydunya.com/api/v1';
const PAYDUNYA_SOFTPAY_WAVE = PAYDUNYA_MODE === 'sandbox'
  ? 'https://app.paydunya.com/sandbox-api/v1/softpay/wave-senegal'
  : 'https://app.paydunya.com/api/v1/softpay/wave-senegal';
const PAYDUNYA_SOFTPAY_OM = PAYDUNYA_MODE === 'sandbox'
  ? 'https://app.paydunya.com/sandbox-api/v1/softpay/orange-money-senegal'
  : 'https://app.paydunya.com/api/v1/softpay/orange-money-senegal';
const PAYDUNYA_SOFTPAY_NEW_OM = PAYDUNYA_MODE === 'sandbox'
  ? 'https://app.paydunya.com/sandbox-api/v1/softpay/new-orange-money-senegal'
  : 'https://app.paydunya.com/api/v1/softpay/new-orange-money-senegal';

console.log(`[PAYDUNYA] Mode utilisé: ${PAYDUNYA_MODE}`);

// Fonction pour formater le numéro de téléphone pour Orange Money Sénégal
// L'API PayDunya Orange Money attend le format local sénégalais (ex: 778676477)
function formatPhoneForOrangeMoney(phone) {
    if (!phone) return '';
    
    // Nettoyer le numéro (supprimer espaces, tirets, parenthèses)
    let cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    
    // Supprimer le préfixe +221 s'il existe
    if (cleanPhone.startsWith('+221')) {
        cleanPhone = cleanPhone.substring(4);
    }
    
    // Supprimer le préfixe 221 s'il existe
    if (cleanPhone.startsWith('221')) {
        cleanPhone = cleanPhone.substring(3);
    }
    
    // Vérifier que le numéro commence par 7 ou 3 (numéros mobiles sénégalais)
    if (cleanPhone.startsWith('7') || cleanPhone.startsWith('3')) {
        return cleanPhone;
    }
    
    // Si le numéro ne commence pas par 7 ou 3, l'assumer comme valide tel quel
    return cleanPhone;
}

// Créer une facture Wave (PayDunya)
app.post('/api/wave/create-invoice', async (req, res) => {
    try {
        const { invoice, store } = req.body;
        console.log('[CREATE-INVOICE] Body envoyé à PayDunya:', { invoice, store });
        const response = await axios.post(
            `${PAYDUNYA_API_BASE}/checkout-invoice/create`,
            { invoice, store },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'PAYDUNYA-MASTER-KEY': process.env.PAYDUNYA_MASTER_KEY,
                    'PAYDUNYA-PRIVATE-KEY': process.env.PAYDUNYA_PRIVATE_KEY,
                    'PAYDUNYA-TOKEN': process.env.PAYDUNYA_TOKEN
                }
            }
        );

        // Enregistrer le token dans la commande Supabase
        const token = response.data.token;
        let orderId = invoice.custom_data?.order_id;
        // Fallback si custom_data.order_id est null ou undefined
        if (!orderId && invoice.order_id) orderId = invoice.order_id;
        console.log('[CREATE-INVOICE] invoice:', invoice);
        console.log('[CREATE-INVOICE] invoice.custom_data:', invoice.custom_data);
        console.log('[CREATE-INVOICE] orderId utilisé pour update:', orderId);
        if (token && orderId) {
            const { supabase } = require('./supabase');
            await supabase
                .from('orders')
                .update({ token })
                .eq('id', orderId);
        }

        res.json(response.data);
    } catch (error) {
        console.error('Erreur lors de la création de la facture:', error);
        try { console.error('Erreur JSON:', JSON.stringify(error, null, 2)); } catch(e) {}
        try { console.error('Erreur toString:', error.toString()); } catch(e) {}
        try { console.error('Erreur stack:', error.stack); } catch(e) {}
        try { console.dir(error, { depth: 5 }); } catch(e) {}
        if (error.response) {
            console.error('PayDunya response.data:', error.response.data);
            console.error('PayDunya response.status:', error.response.status);
        }
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la création de la facture',
            error: error.response ? error.response.data : error.message
        });
    }
});

// Créer un paiement Wave (SOFTPAY API - Production)
app.post('/api/wave/make-payment', async (req, res) => {
    try {
        const { 
            wave_senegal_fullName, 
            wave_senegal_email, 
            wave_senegal_phone, 
            invoice_token,
            password // optionnel pour sandbox
        } = req.body;
        let response;
        if (PAYDUNYA_MODE === 'sandbox') {
            // Paiement test via endpoint sandbox
            response = await axios.post(
                'https://app.paydunya.com/sandbox-api/v1/checkout/make-payment',
                {
                    phone_number: wave_senegal_phone,
                    customer_email: wave_senegal_email,
                    password: password || 'Miliey@2121', // valeur par défaut pour test
                    invoice_token
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'PAYDUNYA-PRIVATE-KEY': process.env.PAYDUNYA_PRIVATE_KEY
                    }
                }
            );
        } else {
            // Paiement réel prod
            response = await axios.post(
                PAYDUNYA_SOFTPAY_WAVE,
                {
                    wave_senegal_fullName,
                    wave_senegal_email,
                    wave_senegal_phone,
                    wave_senegal_payment_token: invoice_token
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'PAYDUNYA-PRIVATE-KEY': process.env.PAYDUNYA_PRIVATE_KEY
                    }
                }
            );
        }
        res.json(response.data);
    } catch (error) {
        console.error('Erreur lors du paiement Wave SOFTPAY:', error?.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: 'Erreur lors du paiement Wave',
            error: error?.response?.data || error.message
        });
    }
});

// Créer un paiement Orange Money (SOFTPAY API - Production)
app.post('/api/orange-money/make-payment', async (req, res) => {
    try {
        const {
            orange_money_senegal_fullName,
            orange_money_senegal_email,
            orange_money_senegal_phone,
            invoice_token,
            password // optionnel pour sandbox
        } = req.body;
        
        // Formater le numéro de téléphone au format local sénégalais
        const formattedPhone = formatPhoneForOrangeMoney(orange_money_senegal_phone);
        console.log(`[ORANGE-MONEY] Numéro original: ${orange_money_senegal_phone}, formaté (local): ${formattedPhone}`);
        
        let response;
        if (PAYDUNYA_MODE === 'sandbox') {
            // Paiement test via endpoint sandbox (identique à Wave)
            response = await axios.post(
                'https://app.paydunya.com/sandbox-api/v1/checkout/make-payment',
                {
                    phone_number: formattedPhone,
                    customer_email: orange_money_senegal_email,
                    password: password || 'Miliey@2121',
                    invoice_token
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'PAYDUNYA-PRIVATE-KEY': process.env.PAYDUNYA_PRIVATE_KEY
                    }
                }
            );
        } else {
            // Paiement réel prod
            response = await axios.post(
                PAYDUNYA_SOFTPAY_OM,
                {
                    orange_money_senegal_fullName,
                    orange_money_senegal_email,
                    orange_money_senegal_phone: formattedPhone,
                    orange_money_senegal_payment_token: invoice_token
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'PAYDUNYA-PRIVATE-KEY': process.env.PAYDUNYA_PRIVATE_KEY
                    }
                }
            );
        }
        res.json(response.data);
    } catch (error) {
        console.error('Erreur lors du paiement Orange Money SOFTPAY:', error?.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: 'Erreur lors du paiement Orange Money',
            error: error?.response?.data || error.message
        });
    }
});

// Endpoint pour paiement Orange Money Sénégal par QR Code (nouvelle API)
app.post('/api/orange-money/qrcode', async (req, res) => {
  try {
    const { customer_name, customer_email, phone_number, invoice_token } = req.body;
    
    // Formater le numéro de téléphone au format local sénégalais
    const formattedPhone = formatPhoneForOrangeMoney(phone_number);
    console.log(`[ORANGE-MONEY-QR] Numéro original: ${phone_number}, formaté (local): ${formattedPhone}`);
    
    const response = await axios.post(
      PAYDUNYA_SOFTPAY_NEW_OM,
      {
        customer_name,
        customer_email,
        phone_number: formattedPhone,
        invoice_token,
        api_type: 'QRCODE'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'PAYDUNYA-PRIVATE-KEY': process.env.PAYDUNYA_PRIVATE_KEY
        }
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Erreur lors du paiement Orange Money QR Code:', error?.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du paiement Orange Money QR Code',
      error: error?.response?.data || error.message
    });
  }
});

// Endpoint pour paiement Orange Money Sénégal par OTP (nouvelle API)
app.post('/api/orange-money/otp', async (req, res) => {
  try {
    const { customer_name, customer_email, phone_number, authorization_code, invoice_token } = req.body;
    
    // Formater le numéro de téléphone au format local sénégalais
    const formattedPhone = formatPhoneForOrangeMoney(phone_number);
    console.log(`[ORANGE-MONEY-OTP] Numéro original: ${phone_number}, formaté (local): ${formattedPhone}`);
    
    const response = await axios.post(
      PAYDUNYA_SOFTPAY_NEW_OM,
      {
        customer_name,
        customer_email,
        phone_number: formattedPhone,
        authorization_code,
        invoice_token,
        api_type: 'OTPCODE'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'PAYDUNYA-PRIVATE-KEY': process.env.PAYDUNYA_PRIVATE_KEY
        }
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Erreur lors du paiement Orange Money OTP:', error?.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du paiement Orange Money OTP',
      error: error?.response?.data || error.message
    });
  }
});

// Webhook pour les notifications de paiement
app.post('/api/payment/webhook', async (req, res) => {
  console.log('Notification paiement reçue:', req.body);
  
  // Récupère le token de la facture dans la notification
  const token = req.body?.invoice_token || req.body?.token || req.body?.data?.invoice?.token;

  // Récupère le statut du paiement
  let status = req.body?.status || req.body?.data?.status || req.body?.payment_status;

  if (!token) {
    console.error('Token manquant dans la notification');
    return res.status(400).json({ error: 'Token manquant dans la notification' });
  }

  try {
    const { supabase } = require('./supabase');
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('id')
      .eq('token', token)
      .limit(1);

    if (fetchError || !orders || orders.length === 0) {
      console.error('Commande non trouvée pour ce token', fetchError);
      return res.status(400).json({ error: 'Commande non trouvée pour ce token' });
    }
    const orderId = orders[0].id;
    console.log('Commande trouvée pour ce token:', orderId);

    const { error } = await supabase
      .from('orders')
      .update({
        status: status === 'completed' || status === 'success' ? 'paid' : 'failed',
        payment_confirmed_at: new Date().toISOString()
      })
      .eq('id', orderId);

    console.log('Résultat update Supabase:', { error, orderId });

    if (error) {
      console.error('Erreur lors de la mise à jour de la commande dans Supabase:', error);
      return res.status(500).json({ error: 'Erreur lors de la mise à jour de la commande', details: error });
    }

    res.status(200).json({ message: 'ok' });
  } catch (err) {
    console.error('Erreur lors du traitement de la notification paiement:', err);
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
});

// Route de compatibilité pour les notifications PayDunya
// Certains fournisseurs vérifient l’accessibilité du callback via GET/HEAD
app.get('/api/paydunya/notification', (req, res) => {
  console.log('[WEBHOOK] GET /api/paydunya/notification – ping reçu');
  res.status(200).json({ success: true, message: 'Callback reachable' });
});

app.head('/api/paydunya/notification', (req, res) => {
  console.log('[WEBHOOK] HEAD /api/paydunya/notification – ping reçu');
  res.status(200).end();
});

app.post('/api/paydunya/notification', async (req, res) => {
  console.log('Notification paiement reçue:', req.body);

  const token = req.body?.invoice_token || req.body?.token || req.body?.data?.invoice?.token;
  let status = req.body?.status || req.body?.data?.status || req.body?.payment_status;

  console.log('Token extrait du webhook:', token);
  console.log('Statut reçu du webhook:', status);

  if (!token) {
    console.warn('[WEBHOOK] Token manquant dans la notification. Body reçu:', req.body, 'Headers:', req.headers);
    // En sandbox, on répond 200 pour éviter les 400 inutiles
    return res.status(200).json({ message: 'Notification reçue sans token (sandbox), ignorée.' });
  }

  try {
    const { supabase } = require('./supabase');
    let orders = [];
    let fetchError = null;
    // Recherche par token
    const res1 = await supabase
      .from('orders')
      .select('id, status, token')
      .eq('token', token)
      .limit(1);
    orders = res1.data;
    fetchError = res1.error;
    console.log('Résultat recherche commande par token:', { orders, fetchError });

    // Fallback : recherche par order_id si pas trouvé
    if ((!orders || orders.length === 0) && req.body?.order_id) {
      console.log('Aucune commande trouvée par token, tentative par order_id:', req.body.order_id);
      const res2 = await supabase
        .from('orders')
        .select('id, status, token')
        .eq('id', req.body.order_id)
        .limit(1);
      orders = res2.data;
      fetchError = res2.error;
      console.log('Résultat recherche commande par order_id:', { orders, fetchError });
    }

    if (fetchError || !orders || orders.length === 0) {
      console.error('Commande non trouvée pour ce token ni order_id', fetchError);
      return res.status(400).json({ error: 'Commande non trouvée pour ce token ni order_id' });
    }
    const orderId = orders[0].id;
    console.log('Commande trouvée pour ce token ou order_id:', orderId);

    const { error } = await supabase
      .from('orders')
      .update({
        status: status === 'completed' || status === 'success' ? 'paid' : 'failed',
        payment_confirmed_at: new Date().toISOString()
      })
      .eq('id', orderId);

    console.log('Résultat update Supabase:', { error, orderId });

    if (error) {
      console.error('Erreur lors de la mise à jour de la commande dans Supabase:', error);
      return res.status(500).json({ error: 'Erreur lors de la mise à jour de la commande', details: error });
    }

    res.status(200).json({ message: 'ok' });
  } catch (err) {
    console.error('Erreur lors du traitement de la notification paiement:', err);
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
});

const PORT = process.env.PORT || 5000;

// Sur Render/production, utiliser HTTP (Render gère le HTTPS)
// En local, essayer HTTPS si certificats disponibles
if (process.env.NODE_ENV === 'production' || !fs.existsSync('../localhost.key')) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HTTP server running on http://0.0.0.0:${PORT}`);
  });
} else {
  try {
    const key = fs.readFileSync('../localhost.key');
    const cert = fs.readFileSync('../localhost.crt');
    https.createServer({ key, cert }, app).listen(PORT, '0.0.0.0', () => {
      console.log(`HTTPS server running on https://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.warn('Erreur HTTPS, basculement en HTTP:', err.message);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`HTTP server running on http://0.0.0.0:${PORT}`);
    });
  }
}
