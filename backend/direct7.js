// backend/direct7.js
// Service d'envoi de SMS OTP via Direct7Networks.
// Les sessions OTP sont persistées dans Supabase (table otp_codes) pour survivre
// aux redémarrages/scale du backend ; fallback en mémoire si Supabase absent.
const axios = require('axios');

const DIRECT7_API_KEY = process.env.DIRECT7_API_KEY;
const DIRECT7_API_URL = process.env.D7_SMS_URL || 'https://api.d7networks.com/messages/v1/send';

// Endpoint WhatsApp interactif (boutons / CTA url). D7 expose une API v2 distincte de messages/v1/send.
// ✅ Confirmé le 2026-07-20 sur le compte réel (numéro 221768171175) : l'envoi interactif passe bien
// par cette v2 (réponse status: 'accepted'). Reste surchargeable via env par sécurité.
const D7_WHATSAPP_URL = process.env.D7_WHATSAPP_URL || 'https://api.d7networks.com/whatsapp/v2/send';
// Originator WhatsApp = le NUMÉRO WhatsApp Business enregistré (format international sans +),
// distinct du sender ID SMS alphanumérique (D7_OTP_ORIGINATOR = 'VALIDEL').
const WHATSAPP_BOT_ORIGINATOR = process.env.WHATSAPP_BOT_NUMBER || process.env.D7_WHATSAPP_ORIGINATOR || '';

const D7_OTP_PROVIDER_ENABLED = String(process.env.D7_OTP_PROVIDER_ENABLED || 'true').toLowerCase() === 'true';
const D7_OTP_PROVIDER_STRICT = String(process.env.D7_OTP_PROVIDER_STRICT || 'false').toLowerCase() === 'true';
const D7_OTP_SEND_URL = process.env.D7_OTP_SEND_URL || 'https://api.d7networks.com/verify/v1/otp/send-otp';
const D7_OTP_VERIFY_URL = process.env.D7_OTP_VERIFY_URL || 'https://api.d7networks.com/verify/v1/otp/verify-otp';
const D7_OTP_ORIGINATOR = process.env.D7_OTP_ORIGINATOR || 'VALIDEL';
const D7_OTP_TEMPLATE = process.env.D7_OTP_TEMPLATE || 'Votre code de verification VALIDEL est: {}. Il expire dans 5 minutes.';

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clampInt(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

const D7_OTP_EXPIRY_SECONDS = parsePositiveInt(process.env.D7_OTP_EXPIRY_SECONDS, 300);
const D7_OTP_RESEND_COOLDOWN_MS = parsePositiveInt(process.env.D7_OTP_RESEND_COOLDOWN_MS, 60 * 1000);
const D7_OTP_LENGTH = clampInt(parsePositiveInt(process.env.D7_OTP_LENGTH, 4), 4, 8);

// Cache mémoire des sessions OTP (secours si Supabase indisponible), keyé par numéro normalisé.
// mode=d7 -> stocke l'otpId généré par le provider.
// mode=local -> fallback quand le provider échoue, stocke le code généré localement.
const otpSessions = new Map();

// Client Supabase admin (service_role) pour persister les sessions OTP.
// Sans lui, les sessions vivent uniquement en mémoire (non fiable en multi-instance / redémarrage).
let otpSupabase = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    otpSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  } else {
    console.warn('[OTP] Supabase non configuré: sessions OTP en mémoire uniquement (non persistant).');
  }
} catch (e) {
  console.warn('[OTP] Client Supabase indisponible, fallback mémoire:', e.message);
}

const OTP_TABLE = 'otp_codes';

function rowToSession(row) {
  if (!row) return null;
  return {
    mode: row.mode || 'local',
    channel: row.channel || 'sms',
    otpId: row.otp_id || null,
    code: row.code || null,
    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : 0,
    lastSentAt: row.last_sent_at ? new Date(row.last_sent_at).getTime() : 0,
  };
}

// Lire la session OTP courante (Supabase prioritaire, secours mémoire).
async function readSession(key) {
  if (!otpSupabase) return otpSessions.get(key) || null;
  try {
    const { data, error } = await otpSupabase
      .from(OTP_TABLE)
      .select('phone, mode, channel, otp_id, code, expires_at, last_sent_at')
      .eq('phone', key)
      .maybeSingle();
    if (error) {
      console.error('[OTP] readSession error:', error.message);
      return otpSessions.get(key) || null;
    }
    return rowToSession(data);
  } catch (e) {
    console.error('[OTP] readSession exception:', e.message);
    return otpSessions.get(key) || null;
  }
}

// Écrire/mettre à jour la session OTP (upsert par numéro).
async function writeSession(key, session) {
  otpSessions.set(key, session); // garder le cache mémoire en secours
  if (!otpSupabase) return;
  try {
    const { error } = await otpSupabase
      .from(OTP_TABLE)
      .upsert({
        phone: key,
        mode: session.mode,
        channel: session.channel || 'sms',
        otp_id: session.otpId || null,
        code: session.code || null,
        expires_at: new Date(session.expiresAt).toISOString(),
        last_sent_at: new Date(session.lastSentAt).toISOString(),
        attempts: 0,
      }, { onConflict: 'phone' });
    if (error) console.error('[OTP] writeSession error:', error.message);
  } catch (e) {
    console.error('[OTP] writeSession exception:', e.message);
  }
}

// Supprimer la session OTP (après vérification réussie ou expiration).
async function deleteSession(key) {
  otpSessions.delete(key);
  if (!otpSupabase) return;
  try {
    const { error } = await otpSupabase.from(OTP_TABLE).delete().eq('phone', key);
    if (error) console.error('[OTP] deleteSession error:', error.message);
  } catch (e) {
    console.error('[OTP] deleteSession exception:', e.message);
  }
}

// Préfixes sénégalais éligibles au SMS via D7 ; les autres passent par WhatsApp (fallback local).
const SMS_SUPPORTED_PREFIXES = ['70', '71', '75', '76', '77', '78'];

// Générer un code OTP numérique (4 chiffres par défaut)
function generateOTP(length = D7_OTP_LENGTH) {
  const safeLength = clampInt(parsePositiveInt(length, D7_OTP_LENGTH), 4, 8);
  const min = 10 ** (safeLength - 1);
  const max = (10 ** safeLength) - 1;
  return Math.floor(min + (Math.random() * (max - min + 1))).toString();
}

function normalizePhoneForProvider(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('221')) return digits;
  if (digits.startsWith('0')) return `221${digits.substring(1)}`;
  if (digits.length === 9) return `221${digits}`;
  return digits;
}

function getOtpSessionKey(phone) {
  return normalizePhoneForProvider(phone);
}

function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${DIRECT7_API_KEY}`,
  };
}

function extractOtpId(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const candidates = [
    payload.otp_id,
    payload.otpId,
    payload.request_id,
    payload.requestId,
    payload.reference_id,
    payload.referenceId,
    payload.verification_id,
    payload.verificationId,
    payload.id,
    payload.data && payload.data.otp_id,
    payload.data && payload.data.otpId,
    payload.data && payload.data.request_id,
    payload.data && payload.data.requestId,
    payload.data && payload.data.reference_id,
    payload.data && payload.data.referenceId,
    payload.data && payload.data.verification_id,
    payload.data && payload.data.verificationId,
  ];

  for (const candidate of candidates) {
    if (candidate == null) continue;
    const text = String(candidate).trim();
    if (text.length > 0) return text;
  }
  return null;
}

function getStatusText(payload) {
  return String(
    payload?.status || payload?.verify_status || payload?.state || payload?.result || ''
  ).toLowerCase();
}

function isProviderVerificationSuccess(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.valid === true || payload.success === true || payload.verified === true) return true;
  const status = getStatusText(payload);
  if (['success', 'successful', 'verified', 'approved', 'valid', 'ok'].includes(status)) return true;
  if (payload.data && typeof payload.data === 'object') return isProviderVerificationSuccess(payload.data);
  return false;
}

function isProviderVerificationFailure(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.valid === false || payload.success === false || payload.verified === false) return true;
  const status = getStatusText(payload);
  if (['failed', 'failure', 'invalid', 'expired', 'denied', 'rejected', 'not_verified', 'error'].includes(status)) return true;
  const message = String(payload.message || payload.error || '').toLowerCase();
  if (/invalid|expired|incorrect|wrong|mismatch/.test(message)) return true;
  if (payload.data && typeof payload.data === 'object') return isProviderVerificationFailure(payload.data);
  return false;
}

function requireOtpProviderConfig() {
  if (!DIRECT7_API_KEY) {
    throw new Error('DIRECT7_API_KEY non configurée');
  }
  if (!D7_OTP_SEND_URL || !D7_OTP_VERIFY_URL) {
    throw new Error('D7_OTP endpoints non configurés');
  }
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
          originator: D7_OTP_ORIGINATOR,
          report_url: null
        }
      },
      {
        headers: {
          ...getAuthHeaders()
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

// Envoyer un message WhatsApp texte simple via Direct7Networks.
// IMPORTANT : passe par l'API WhatsApp v2 (whatsapp/v2/send) avec le NUMÉRO WhatsApp
// Business comme originator — exactement comme les messages interactifs. L'ancienne
// implémentation utilisait messages/v1/send avec l'originator SMS 'VALIDEL' : D7
// « acceptait » la requête (status: accepted) mais WhatsApp ne livrait jamais le message
// (VALIDEL n'est pas un numéro WhatsApp). C'est ce qui rendait muettes les réponses
// texte du bot (code inconnu, « bonjour »…), alors que les boutons (déjà en v2) passaient.
async function sendWhatsApp(phone, message) {
  if (!DIRECT7_API_KEY) {
    throw new Error('DIRECT7_API_KEY non configurée');
  }
  if (!WHATSAPP_BOT_ORIGINATOR) {
    throw new Error('WHATSAPP_BOT_NUMBER non configuré (numéro WhatsApp Business requis pour l\'envoi WhatsApp)');
  }

  try {
    const response = await axios.post(
      D7_WHATSAPP_URL,
      {
        messages: [
          {
            originator: WHATSAPP_BOT_ORIGINATOR,
            recipients: [
              { recipient: normalizeWhatsAppPhone(phone), recipient_type: 'individual' },
            ],
            content: {
              message_type: 'TEXT',
              text: { preview_url: false, body: String(message || '') },
            },
          },
        ],
      },
      {
        headers: {
          ...getAuthHeaders()
        }
      }
    );

    console.log('[DIRECT7] WhatsApp texte envoyé avec succès:', response.data);
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

// --- WhatsApp interactif (bot conversationnel Validèl) -----------------------
// Ces fonctions envoient des messages interactifs (boutons de réponse, bouton CTA url)
// via l'API WhatsApp v2 de D7. Elles sont séparées de sendWhatsApp (texte simple, v1)
// pour isoler l'incertitude sur le shape exact — voir D7_WHATSAPP_URL plus haut.

function normalizeWhatsAppPhone(phone) {
  return String(phone || '').startsWith('+') ? String(phone).substring(1) : String(phone || '');
}

async function postD7Whatsapp(messagePayload) {
  if (!DIRECT7_API_KEY) {
    throw new Error('DIRECT7_API_KEY non configurée');
  }
  if (!WHATSAPP_BOT_ORIGINATOR) {
    throw new Error('WHATSAPP_BOT_NUMBER non configuré (numéro WhatsApp Business Validèl requis pour l\'envoi interactif)');
  }
  try {
    const response = await axios.post(
      D7_WHATSAPP_URL,
      { messages: [messagePayload] },
      { headers: { ...getAuthHeaders() } }
    );
    console.log('[DIRECT7] WhatsApp interactif envoyé:', response.data);
    return { success: true, data: response.data };
  } catch (error) {
    const apiData = error?.response?.data;
    console.error('[DIRECT7] Erreur envoi WhatsApp interactif:', apiData || error?.message || error);
    throw new Error(apiData?.message || error?.message || "Erreur lors de l'envoi WhatsApp interactif");
  }
}

// Envoi d'un message avec 1 à 3 boutons de réponse rapide.
// buttons = [{ id, title }] ; title tronqué à 20 caractères (contrainte WhatsApp),
// id limité à 256 caractères. Max 3 boutons.
async function sendWhatsAppButtons(phone, bodyText, buttons) {
  const safeButtons = (Array.isArray(buttons) ? buttons : []).slice(0, 3).map((b) => ({
    type: 'reply',
    reply: {
      id: String(b.id || '').slice(0, 256),
      title: String(b.title || '').slice(0, 20),
    },
  }));
  return postD7Whatsapp({
    originator: WHATSAPP_BOT_ORIGINATOR,
    recipients: [{ recipient: normalizeWhatsAppPhone(phone), recipient_type: 'individual' }],
    content: {
      message_type: 'INTERACTIVE',
      interactive: {
        type: 'button',
        body: { text: String(bodyText || '').slice(0, 1024) },
        action: { buttons: safeButtons },
      },
    },
  });
}

// Envoi d'un message avec un unique bouton CTA url (ouvre un lien). Ne se combine pas
// avec des boutons de réponse -> message séparé (contrainte WhatsApp).
async function sendWhatsAppCtaUrl(phone, bodyText, displayText, url) {
  return postD7Whatsapp({
    originator: WHATSAPP_BOT_ORIGINATOR,
    recipients: [{ recipient: normalizeWhatsAppPhone(phone), recipient_type: 'individual' }],
    content: {
      message_type: 'INTERACTIVE',
      interactive: {
        type: 'cta_url',
        body: { text: String(bodyText || '').slice(0, 1024) },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: String(displayText || '').slice(0, 20),
            url: String(url || ''),
          },
        },
      },
    },
  });
}

// Envoi d'un message TEMPLATE approuvé par Meta (fiable hors fenêtre 24h, contrairement
// aux messages libres/interactifs qui exigent que le client ait écrit dans les 24h).
// - templateId : nom exact du template approuvé (D7 l'appelle "template_id")
// - language : code langue exact du template (ex. 'fr')
// - bodyParams : valeurs des variables {{1}}, {{2}}… du CORPS, dans l'ordre
// - urlButtonSuffix : suffixe dynamique du bouton URL (partie après l'URL de base
//   définie dans le template) ; omis s'il n'y a pas de bouton dynamique.
async function sendWhatsAppTemplate(phone, { templateId, language, bodyParams = [], urlButtonSuffix = null }) {
  if (!templateId) throw new Error('templateId requis pour l\'envoi de template');
  const body_parameter_values = {};
  (Array.isArray(bodyParams) ? bodyParams : []).forEach((v, i) => {
    body_parameter_values[String(i)] = String(v == null ? '' : v);
  });

  const template = {
    template_id: templateId,
    language: language || 'fr',
    body_parameter_values,
  };
  if (urlButtonSuffix != null) {
    template.buttons = {
      actions: [
        { action_index: '0', action_type: 'URL', action_payload: String(urlButtonSuffix) },
      ],
    };
  }

  return postD7Whatsapp({
    originator: WHATSAPP_BOT_ORIGINATOR,
    recipients: [{ recipient: normalizeWhatsAppPhone(phone), recipient_type: 'individual' }],
    content: { message_type: 'TEMPLATE', template },
  });
}

async function sendProviderOTP(phone) {
  requireOtpProviderConfig();

  const recipient = normalizePhoneForProvider(phone);
  const response = await axios.post(
    D7_OTP_SEND_URL,
    {
      originator: D7_OTP_ORIGINATOR,
      recipient,
      content: D7_OTP_TEMPLATE,
      expiry: D7_OTP_EXPIRY_SECONDS,
      otp_length: D7_OTP_LENGTH,
      data_coding: 'text',
    },
    {
      headers: {
        ...getAuthHeaders(),
      },
    }
  );

  const otpId = extractOtpId(response.data);
  if (!otpId) {
    console.error('[OTP][D7] Réponse sans otp_id:', response.data);
    throw new Error('D7_OTP_ID_MISSING');
  }

  const providerOtpLength = Number(
    response?.data?.otp_length ||
    response?.data?.otpLength ||
    response?.data?.data?.otp_length ||
    response?.data?.data?.otpLength ||
    0
  );
  if (Number.isFinite(providerOtpLength) && providerOtpLength > 0 && providerOtpLength !== D7_OTP_LENGTH) {
    throw new Error(`D7_OTP_LENGTH_MISMATCH:${providerOtpLength}`);
  }

  return { otpId, raw: response.data };
}

async function verifyProviderOTP(otpId, code) {
  requireOtpProviderConfig();

  const response = await axios.post(
    D7_OTP_VERIFY_URL,
    {
      otp_id: String(otpId),
      otp_code: String(code),
      otp: String(code),
    },
    {
      headers: {
        ...getAuthHeaders(),
      },
    }
  );

  const payload = response.data || {};
  if (isProviderVerificationSuccess(payload)) {
    return { valid: true };
  }
  if (isProviderVerificationFailure(payload)) {
    return { valid: false, error: 'Code OTP invalide ou expiré' };
  }

  console.warn('[OTP][D7] Réponse de vérification non reconnue:', payload);
  return { valid: false, error: 'Impossible de vérifier le code OTP' };
}

async function sendLocalFallbackOTP(phone) {
  const otp = generateOTP(D7_OTP_LENGTH);
  const message = `Votre code de verification VALIDEL est: ${otp}. Il expire dans 5 minutes.`;
  const now = Date.now();
  const key = getOtpSessionKey(phone);

  if (canReceiveSMS(phone)) {
    await sendSMS(phone, message);
    console.log(`[OTP] Code envoyé à ${phone} via sms`);
    await writeSession(key, {
      mode: 'local',
      channel: 'sms',
      code: otp,
      expiresAt: now + (D7_OTP_EXPIRY_SECONDS * 1000),
      lastSentAt: now,
    });
    return { success: true, channel: 'sms', provider: 'local', otpLength: D7_OTP_LENGTH };
  }

  await sendWhatsApp(phone, message);
  console.log(`[OTP] Code envoyé à ${phone} via whatsapp`);
  await writeSession(key, {
    mode: 'local',
    channel: 'whatsapp',
    code: otp,
    expiresAt: now + (D7_OTP_EXPIRY_SECONDS * 1000),
    lastSentAt: now,
  });
  return { success: true, channel: 'whatsapp', provider: 'local', otpLength: D7_OTP_LENGTH };
}

// Envoyer un OTP et enregistrer une session vérifiable (D7 provider ou fallback local)
async function sendOTP(phone) {
  const now = Date.now();
  const key = getOtpSessionKey(phone);
  const existing = await readSession(key);

  // Cost guard: if a valid OTP was already sent recently, do not send another one.
  if (existing && existing.expiresAt > now && (now - existing.lastSentAt) < D7_OTP_RESEND_COOLDOWN_MS) {
    return {
      success: true,
      channel: existing.channel || 'sms',
      reused: true,
      provider: existing.mode || 'local',
      otpLength: D7_OTP_LENGTH,
    };
  }

  if (D7_OTP_PROVIDER_ENABLED) {
    try {
      const sent = await sendProviderOTP(phone);
      await writeSession(key, {
        mode: 'd7',
        channel: 'sms',
        otpId: sent.otpId,
        expiresAt: now + (D7_OTP_EXPIRY_SECONDS * 1000),
        lastSentAt: now,
      });
      console.log(`[OTP][D7] OTP provider envoyé pour ${phone}, otp_id=${sent.otpId}`);
      return { success: true, channel: 'sms', provider: 'd7', otpLength: D7_OTP_LENGTH };
    } catch (error) {
      console.error('[OTP][D7] Échec provider OTP:', error?.response?.data || error?.message || error);
      if (D7_OTP_PROVIDER_STRICT) {
        throw error;
      }
      console.warn('[OTP] Fallback local OTP activé');
      return sendLocalFallbackOTP(phone);
    }
  }

  return sendLocalFallbackOTP(phone);
}

// Vérifier un OTP
async function verifyOTP(phone, code) {
  const normalizedCode = String(code || '').replace(/\D/g, '');
  if (normalizedCode.length !== D7_OTP_LENGTH) {
    return { valid: false, error: `Le code OTP doit contenir ${D7_OTP_LENGTH} chiffres` };
  }

  const key = getOtpSessionKey(phone);
  const session = await readSession(key);
  const now = Date.now();

  if (!session) {
    return { valid: false, error: 'OTP introuvable, demandez un nouveau code' };
  }

  if (!session.expiresAt || session.expiresAt <= now) {
    await deleteSession(key);
    return { valid: false, error: 'OTP expiré, demandez un nouveau code' };
  }

  if (session.mode === 'd7' && session.otpId) {
    try {
      const result = await verifyProviderOTP(session.otpId, normalizedCode);
      if (result.valid) {
        await deleteSession(key);
      }
      return result;
    } catch (error) {
      console.error('[OTP][D7] Erreur vérification provider:', error?.response?.data || error?.message || error);
      if (D7_OTP_PROVIDER_STRICT) {
        throw new Error('Erreur fournisseur OTP');
      }
      return { valid: false, error: 'Impossible de vérifier le code OTP (provider)' };
    }
  }

  const valid = normalizedCode === String(session.code || '');
  if (valid) {
    await deleteSession(key);
    return { valid: true };
  }
  return { valid: false, error: 'Code OTP invalide' };
}

module.exports = {
  sendOTP,
  verifyOTP,
  sendSMS,
  sendWhatsApp,
  sendWhatsAppButtons,
  sendWhatsAppCtaUrl,
  sendWhatsAppTemplate
};
