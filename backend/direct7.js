// backend/direct7.js
// Service d'envoi de SMS OTP via Direct7Networks + stockage Supabase
const axios = require('axios');
const { supabase } = require('./supabase');

const DIRECT7_API_KEY = process.env.DIRECT7_API_KEY;
const DIRECT7_API_URL = 'https://api.d7networks.com/messages/v1/send';

// Générer un code OTP à 4 chiffres
function generateOTP() {
  return Math.floor(1000 + Math.random() * 9000).toString();
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

// Envoyer un OTP (stocké dans Supabase)
async function sendOTP(phone) {
  // Vérifier que supabase est bien initialisé avec service role
  if (!supabase) {
    console.error('[OTP] Client Supabase non initialisé');
    throw new Error('Service OTP indisponible');
  }
  
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // Expire dans 5 minutes

  console.log('[OTP] Tentative insertion pour:', phone, '- Client Supabase disponible:', !!supabase);

  // Supprimer les anciens OTP pour ce numéro
  await supabase
    .from('otp_codes')
    .delete()
    .eq('phone', phone);

  // Stocker le nouvel OTP dans Supabase
  const { error: insertError } = await supabase
    .from('otp_codes')
    .insert({
      phone,
      code: otp,
      expires_at: expiresAt,
      attempts: 0
    });

  if (insertError) {
    console.error('[OTP] Erreur insertion Supabase:', insertError);
    throw new Error('Erreur lors de la création du code');
  }

  // Envoyer le SMS
  const message = `Votre code de verification VALIDEL est: ${otp}. Il expire dans 5 minutes.`;
  
  try {
    await sendSMS(phone, message);
  } catch (err) {
    // Ne pas laisser un OTP en base si l'envoi SMS a échoué
    try {
      await supabase.from('otp_codes').delete().eq('phone', phone);
    } catch (cleanupErr) {
      console.error('[OTP] Erreur nettoyage OTP après échec SMS:', cleanupErr);
    }
    throw err;
  }

  console.log(`[OTP] Code envoyé à ${phone}: ${otp} (expire à ${expiresAt})`);
  
  return { success: true };
}

// Vérifier un OTP (depuis Supabase)
async function verifyOTP(phone, code) {
  // Récupérer l'OTP stocké
  const { data: stored, error: fetchError } = await supabase
    .from('otp_codes')
    .select('*')
    .eq('phone', phone)
    .single();

  if (fetchError || !stored) {
    return { valid: false, error: 'Aucun code en attente pour ce numéro' };
  }

  // Vérifier expiration
  if (new Date() > new Date(stored.expires_at)) {
    await supabase.from('otp_codes').delete().eq('phone', phone);
    return { valid: false, error: 'Le code a expiré' };
  }

  // Vérifier les tentatives (max 5)
  if (stored.attempts >= 5) {
    await supabase.from('otp_codes').delete().eq('phone', phone);
    return { valid: false, error: 'Trop de tentatives. Demandez un nouveau code.' };
  }

  // Incrémenter les tentatives
  await supabase
    .from('otp_codes')
    .update({ attempts: stored.attempts + 1 })
    .eq('phone', phone);

  // Vérifier le code
  if (stored.code !== code) {
    return { valid: false, error: 'Code incorrect' };
  }

  // Code valide - supprimer de la base
  await supabase.from('otp_codes').delete().eq('phone', phone);
  
  return { valid: true };
}

module.exports = {
  sendOTP,
  verifyOTP,
  sendSMS
};
