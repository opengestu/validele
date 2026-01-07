// PixPay (Wave SN) - Intégration Orange Money et autres opérateurs
const axios = require('axios');

// Configuration PixPay
const PIXPAY_CONFIG = {
  api_key: process.env.PIXPAY_API_KEY || '',
  business_name_id: process.env.PIXPAY_BUSINESS_ID || '',
  // Logique PixPay:
  // CASHOUT (213) = Client paie → argent entre dans notre compte PixPay
  // CASHIN (214) = On paie vendeur/livreur → argent sort de notre compte PixPay
  service_id_client_payment: parseInt(process.env.PIXPAY_SERVICE_ID_CLIENT_PAYMENT || '213'),
  service_id_vendor_payout: parseInt(process.env.PIXPAY_SERVICE_ID_VENDOR_PAYOUT || '214'),
  base_url: process.env.PIXPAY_BASE_URL || 'https://proxy-coreapi.pixelinnov.net/api_v1',
  ipn_base_url: process.env.PIXPAY_IPN_BASE_URL || 'https://validele.onrender.com',
  // Configuration Wave PixPay
  wave_service_id: parseInt(process.env.PIXPAY_WAVE_SERVICE_ID || '211'),
  wave_business_name_id: process.env.PIXPAY_WAVE_BUSINESS_NAME_ID || '',
  wave_redirect_url: process.env.PIXPAY_WAVE_REDIRECT_URL || 'https://validele.onrender.com/payment-success',
  wave_redirect_error_url: process.env.PIXPAY_WAVE_REDIRECT_ERROR_URL || 'https://validele.onrender.com/payment-error'
};

console.log('[PIXPAY] Configuration chargée:', {
  api_key: PIXPAY_CONFIG.api_key ? '***' + PIXPAY_CONFIG.api_key.slice(-8) : 'NON DÉFINI',
  service_id_client_payment: PIXPAY_CONFIG.service_id_client_payment,
  service_id_vendor_payout: PIXPAY_CONFIG.service_id_vendor_payout,
  wave_service_id: PIXPAY_CONFIG.wave_service_id,
  wave_business_name_id: PIXPAY_CONFIG.wave_business_name_id ? '***' : 'NON DÉFINI',
  base_url: PIXPAY_CONFIG.base_url,
  ipn_base_url: PIXPAY_CONFIG.ipn_base_url
});

/**
 * Initier un paiement (collecte) - Le client paie via un lien web
 * Note: PixPay génère un lien web (pas un vrai SMS) que le client ouvre pour payer
 * @param {Object} params
 * @param {number} params.amount - Montant en FCFA
 * @param {string} params.phone - Numéro du payeur (format: 221XXXXXXXXX)
 * @param {string} params.orderId - ID de la commande
 * @param {Object} params.customData - Données additionnelles (optionnel)
 * @returns {Promise<Object>} Réponse PixPay avec sms_link (lien web)
 */
async function initiatePayment(params) {
  const { amount, phone, orderId, customData = {} } = params;

  if (!PIXPAY_CONFIG.api_key) {
    throw new Error('PIXPAY_API_KEY non configurée');
  }

  // Formater le numéro de téléphone (retirer le +)
  const formattedPhone = phone.replace(/^\+/, '');

  const payload = {
    amount: parseInt(amount),
    destination: formattedPhone,
    api_key: PIXPAY_CONFIG.api_key,
    service_id: PIXPAY_CONFIG.service_id_client_payment, // CASHOUT (213) = client paie → argent entre chez nous
    ipn_url: `${PIXPAY_CONFIG.ipn_base_url}/api/payment/pixpay-webhook`,
    custom_data: JSON.stringify({
      order_id: orderId,
      ...customData
    })
  };

  // Ajouter business_name_id si configuré
  if (PIXPAY_CONFIG.business_name_id) {
    payload.business_name_id = PIXPAY_CONFIG.business_name_id;
  }

  console.log('[PIXPAY] Initiation paiement client (CASHOUT 213):', {
    amount,
    phone: formattedPhone,
    orderId,
    service_id: PIXPAY_CONFIG.service_id_client_payment,
    ipn_url: `${PIXPAY_CONFIG.ipn_base_url}/api/payment/pixpay-webhook`
  });

  try {
    const response = await axios.post(
      `${PIXPAY_CONFIG.base_url}/transaction/airtime`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    console.log('[PIXPAY] Réponse:', {
      transaction_id: response.data.data?.transaction_id,
      state: response.data.data?.state,
      message: response.data.message
    });

    return {
      success: response.data.statut_code === 200,
      transaction_id: response.data.data?.transaction_id,
      provider_id: response.data.data?.provider_id,
      state: response.data.data?.state,
      message: response.data.message,
      sms_link: response.data.data?.sms_link,
      amount: response.data.data?.amount,
      fee: response.data.data?.fee,
      raw: response.data
    };
  } catch (error) {
    console.error('[PIXPAY] Erreur:', {
      status: error.response?.status,
      message: error.response?.data?.message || error.message
    });

    throw new Error(
      error.response?.data?.message || 
      'Erreur lors de l\'initiation du paiement PixPay'
    );
  }
}

/**
 * Envoyer de l'argent (décaissement) - Payer un vendeur/livreur
 * @param {Object} params
 * @param {number} params.amount - Montant en FCFA
 * @param {string} params.phone - Numéro du bénéficiaire
 * @param {string} params.orderId - ID de la commande
 * @param {string} params.type - Type: 'vendor_payment' ou 'delivery_payment'
 * @returns {Promise<Object>} Réponse PixPay
 */
async function sendMoney(params) {
  const { amount, phone, orderId, type = 'payout' } = params;

  if (!PIXPAY_CONFIG.api_key) {
    throw new Error('PIXPAY_API_KEY non configurée');
  }

  const formattedPhone = phone.replace(/^\+/, '');

  const payload = {
    amount: parseInt(amount),
    destination: formattedPhone,
    api_key: PIXPAY_CONFIG.api_key,
    service_id: PIXPAY_CONFIG.service_id_vendor_payout, // CASHIN (214) = on paie vendeur → argent sort de chez nous
    ipn_url: `${PIXPAY_CONFIG.ipn_base_url}/api/payment/pixpay-webhook`,
    custom_data: JSON.stringify({
      order_id: orderId,
      type
    })
  };

  if (PIXPAY_CONFIG.business_name_id) {
    payload.business_name_id = PIXPAY_CONFIG.business_name_id;
  }

  console.log('[PIXPAY] Paiement vendeur/livreur (CASHIN 214):', {
    amount,
    phone: formattedPhone,
    orderId,
    type,
    service_id: PIXPAY_CONFIG.service_id_vendor_payout
  });

  try {
    const response = await axios.post(
      `${PIXPAY_CONFIG.base_url}/transaction/airtime`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    return {
      success: response.data.statut_code === 200,
      transaction_id: response.data.data?.transaction_id,
      state: response.data.data?.state,
      message: response.data.message,
      raw: response.data
    };
  } catch (error) {
    console.error('[PIXPAY] Erreur envoi:', {
      status: error.response?.status,
      message: error.response?.data?.message || error.message
    });

    throw new Error(
      error.response?.data?.message || 
      'Erreur lors de l\'envoi d\'argent PixPay'
    );
  }
}

/**
 * Vérifier le statut d'une transaction
 * @param {string} transactionId - ID de la transaction PixPay
 * @returns {Promise<Object>} Statut de la transaction
 */
async function checkTransactionStatus(transactionId) {
  // Note: PixPay n'a pas d'endpoint de vérification dans la doc fournie
  // Le statut est reçu via IPN uniquement
  console.warn('[PIXPAY] checkTransactionStatus: endpoint non disponible, utiliser IPN');
  return {
    success: false,
    message: 'Utilisez le webhook IPN pour le statut des transactions'
  };
}

/**
 * Initier un paiement Wave via PixPay
 * @param {Object} params
 * @param {number} params.amount - Montant en FCFA
 * @param {string} params.phone - Numéro du payeur (format: 221XXXXXXXXX)
 * @param {string} params.orderId - ID de la commande
 * @param {Object} params.customData - Données additionnelles (optionnel)
 * @returns {Promise<Object>} Réponse PixPay avec redirection
 */
async function initiateWavePayment(params) {
  const { amount, phone, orderId, customData = {} } = params;

  if (!PIXPAY_CONFIG.api_key) {
    throw new Error('PIXPAY_API_KEY non configurée');
  }

  if (!PIXPAY_CONFIG.wave_business_name_id) {
    throw new Error('PIXPAY_WAVE_BUSINESS_NAME_ID non configuré');
  }

  // Formater le numéro de téléphone (retirer le +)
  const formattedPhone = phone ? phone.replace(/^\+/, '') : '';

  const payload = {
    amount: parseInt(amount),
    destination: formattedPhone,
    api_key: PIXPAY_CONFIG.api_key,
    service_id: PIXPAY_CONFIG.wave_service_id,
    business_name_id: PIXPAY_CONFIG.wave_business_name_id,
    ipn_url: `${PIXPAY_CONFIG.ipn_base_url}/api/payment/pixpay-webhook`,
    redirect_url: PIXPAY_CONFIG.wave_redirect_url,
    redirect_error_url: PIXPAY_CONFIG.wave_redirect_error_url,
    custom_data: JSON.stringify({
      order_id: orderId,
      payment_method: 'wave',
      ...customData
    })
  };

  console.log('[PIXPAY-WAVE] Initiation paiement Wave:', {
    amount,
    phone: formattedPhone,
    orderId,
    service_id: PIXPAY_CONFIG.wave_service_id,
    business_name_id: PIXPAY_CONFIG.wave_business_name_id,
    ipn_url: `${PIXPAY_CONFIG.ipn_base_url}/api/payment/pixpay-webhook`
  });

  try {
    const response = await axios.post(
      `${PIXPAY_CONFIG.base_url}/transaction/airtime`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    console.log('[PIXPAY-WAVE] Réponse:', {
      transaction_id: response.data.data?.transaction_id,
      state: response.data.data?.state,
      message: response.data.message,
      sms_link: response.data.data?.sms_link
    });

    return {
      success: response.data.statut_code === 200,
      transaction_id: response.data.data?.transaction_id,
      provider_id: response.data.data?.provider_id,
      state: response.data.data?.state,
      message: response.data.message,
      sms_link: response.data.data?.sms_link,
      amount: response.data.data?.amount,
      fee: response.data.data?.fee,
      raw: response.data
    };
  } catch (error) {
    console.error('[PIXPAY-WAVE] Erreur:', {
      status: error.response?.status,
      message: error.response?.data?.message || error.message,
      data: error.response?.data
    });

    throw {
      success: false,
      message: error.response?.data?.message || error.message,
      status: error.response?.status,
      raw: error.response?.data
    };
  }
}

module.exports = {
  initiatePayment,
  initiateWavePayment,
  sendMoney,
  checkTransactionStatus,
  PIXPAY_CONFIG
};
