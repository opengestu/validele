// backend/direct7.js
// Service d'envoi de SMS OTP via Direct7Networks + stockage Supabase
// WhatsApp pour préfixes non supportés par SMS (71, 75, etc.)
const axios = require('axios');
const { supabase } = require('./supabase');

const DIRECT7_API_KEY = process.env.DIRECT7_API_KEY;
const DIRECT7_API_URL = 'https://api.d7networks.com/messages/v1/send';

// Préfixes sénégalais dont le SMS est fiable via D7 (après +221)
const SMS_SUPPORTED_PREFIXES = ['70', '76', '77', '78'];

// Générer un code OTP à 4 chiffres
function generateOTP() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Détermine si le numéro peut recevoir un SMS via D7
function canReceiveSMS(phone) {
  const match = phone.replace(/\D/g, '').match(/^221(\d{2})/);
  if (!match) return false;
  return SMS_SUPPORTED_PREFIXES.includes(match[1]);
}

// Envoyer un SMS via Direct7Networks
async function sendSMS(phone, message) {
  if (!DIRECT7_API_KEY) {
    throw new Error('DIRECT7_API_KEY non configurée');
  }

  // Formater le numéro (enlever le + pour l'API)
  const formattedPhone = phone.startsWith('+') ? phone.substring(1) : phone;

  try {
    const response = await axios.post(
      DIRECT7_API_URL,
      {
        messages: [
          {
            channel: 'sms',
            recipients: [formattedPhone],
            content: message,
            msg_type: 'text',
            data_coding: 'text'
          }
        ],
        message_globals: {
          originator: 'VALIDEL',
          report_url: null
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DIRECT7_API_KEY}`
        }
      }
    );

    console.log('[DIRECT7] SMS envoyé avec succès:', response.data);
    return { success: true, data: response.data };
  } catch (error) {
    const apiData = error?.response?.data;
    const detail = apiData?.detail;

    // Normaliser les erreurs Direct7 pour éviter "[object Object]"
    const detailCode = typeof detail === 'object' && detail ? detail.code : undefined;
    const detailMessage = typeof detail === 'object' && detail ? detail.message : undefined;
    const fallbackMessage = typeof apiData?.message === 'string' ? apiData.message : undefined;
    const finalMessage =
      (typeof detailMessage === 'string' && detailMessage.trim()) ||
      (typeof fallbackMessage === 'string' && fallbackMessage.trim()) ||
      (typeof error?.message === 'string' && error.message.trim()) ||
      "Erreur lors de l'envoi du SMS";

    console.error('[DIRECT7] Erreur envoi SMS:', apiData || error?.message || error);
    const prefix = detailCode ? `${detailCode}: ` : '';
    throw new Error(`${prefix}${finalMessage}`);
  }
}

// Envoyer un message WhatsApp via Direct7Networks
async function sendWhatsApp(phone, message) {
  if (!DIRECT7_API_KEY) {
    throw new Error('DIRECT7_API_KEY non configurée');
  }

  const formattedPhone = phone.startsWith('+') ? phone.substring(1) : phone;

  try {
    const response = await axios.post(
      DIRECT7_API_URL,
      {
        messages: [
          {
            channel: 'whatsapp',
            recipients: [formattedPhone],
            content: message,
            msg_type: 'text'
          }
        ],
        message_globals: {
          originator: 'VALIDEL',
          report_url: null
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DIRECT7_API_KEY}`
        }
      }
    );

    console.log('[DIRECT7] WhatsApp envoyé avec succès:', response.data);
    return { success: true, data: response.data };
  } catch (error) {
    const apiData = error?.response?.data;
    const detail = apiData?.detail;
    const detailMessage = typeof detail === 'object' && detail ? detail.message : undefined;
    const fallbackMessage = typeof apiData?.message === 'string' ? apiData.message : undefined;
    const finalMessage =
      (typeof detailMessage === 'string' && detailMessage.trim()) ||
      (typeof fallbackMessage === 'string' && fallbackMessage.trim()) ||
      (typeof error?.message === 'string' && error.message.trim()) ||
      "Erreur lors de l'envoi WhatsApp";

    console.error('[DIRECT7] Erreur envoi WhatsApp:', apiData || error?.message || error);
    throw new Error(finalMessage);
  }
}

// Envoyer un OTP — SMS pour 70/76/77/78, WhatsApp pour les autres (71, 75, etc.)
async function sendOTP(phone) {
  const otp = generateOTP();
  const message = `Votre code de verification VALIDEL est: ${otp}. Il expire dans 5 minutes.`;

  if (canReceiveSMS(phone)) {
    await sendSMS(phone, message);
    console.log(`[OTP] Code envoyé à ${phone} via sms: ${otp}`);
    return { success: true, channel: 'sms' };
  }

  await sendWhatsApp(phone, message);
  console.log(`[OTP] Code envoyé à ${phone} via whatsapp: ${otp}`);
  return { success: true, channel: 'whatsapp' };
}

// Vérifier un OTP (depuis Supabase)
async function verifyOTP(phone, code) {
  // Ici, il faudrait vérifier le code via Direct7 ou la logique de votre choix
  // À adapter selon votre méthode de validation (API D7, cache, etc.)
  // Exemple placeholder :
  return { valid: true };
}

module.exports = {
  sendOTP,
  verifyOTP,
  sendSMS
};
