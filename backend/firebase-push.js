// --- SUPABASE ---
// Configure ici tes variables d'environnement Supabase
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

/**
 * Supprimer les tokens FCM invalides dans Supabase
 * @param {string[]} invalidTokens - Liste des tokens à supprimer
 */
async function removeInvalidTokens(invalidTokens) {
  if (!supabase) {
    console.warn('[SUPABASE] Non configuré, suppression ignorée');
    return;
  }
  for (const token of invalidTokens) {
    const { error } = await supabase
      .from('fcm_tokens') // Remplace par le nom de ta table si besoin
      .delete()
      .eq('token', token); // Remplace par le nom de la colonne si besoin
    if (error) {
      console.error(`[SUPABASE] Erreur suppression token ${token}:`, error);
    } else {
      console.log(`[SUPABASE] Token supprimé: ${token}`);
    }
  }
}
// Firebase Cloud Messaging - HTTP v1 API
const { google } = require('googleapis');
// IMPORTANT: ne pas committer de fichier JSON de compte de service.
// Sur Render, fournissez les credentials via env:
// - FIREBASE_SERVICE_ACCOUNT_JSON (JSON string)
// - ou FIREBASE_SERVICE_ACCOUNT_BASE64 (base64 du JSON)
// - et FIREBASE_PROJECT_ID

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'validel-d7c83';

// Scopes requis pour FCM
const SCOPES = ['https://www.googleapis.com/auth/firebase.messaging'];

/**
 * Vérifier si Firebase est configuré
 */
function isFirebaseConfigured() {
  return !!(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64);
}

/**
 * Obtenir un token d'accès OAuth2 pour FCM
 */
async function getAccessToken() {
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw && process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    try {
      raw = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    } catch (e) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 invalide');
    }
  }
  if (!raw) {
    return null; // Retourner null au lieu de throw
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON invalide (JSON attendu)');
  }
  
  const jwtClient = new google.auth.JWT(
    serviceAccount.client_email,
    null,
    serviceAccount.private_key,
    SCOPES,
    null
  );

  const tokens = await jwtClient.authorize();
  return tokens.access_token;
}

/**
 * Envoyer une notification push à un appareil spécifique
 * @param {string} token - Token FCM de l'appareil
 * @param {string} title - Titre de la notification
 * @param {string} body - Corps de la notification
 * @param {object} data - Données supplémentaires (optionnel)
 */
async function sendPushNotification(token, title, body, data = {}) {
  if (!isFirebaseConfigured()) {
    console.warn('[FIREBASE] Non configuré, notification ignorée:', { title });
    return { success: false, message: 'Firebase non configuré' };
  }
  
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { success: false, message: 'Impossible d\'obtenir le token Firebase' };
  }
  
  // Firebase FCM requiert que toutes les valeurs de 'data' soient des strings
  const stringData = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && value !== undefined) {
      stringData[key] = String(value);
    }
  }
  
  const message = {
    message: {
      token: token,
      notification: {
        title: title,
        body: body,
      },
      data: stringData,
      android: {
        priority: 'high',
        notification: {
          channel_id: 'fcm_default_channel',
          sound: 'default',
        },
      },
    },
  };

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    }
  );

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(`FCM Error: ${JSON.stringify(result)}`);
  }
  
  return result;
}

/**
 * Envoyer une notification push à plusieurs appareils
 * @param {string[]} tokens - Liste des tokens FCM
 * @param {string} title - Titre de la notification
 * @param {string} body - Corps de la notification
 * @param {object} data - Données supplémentaires (optionnel)
 */
async function sendPushToMultiple(tokens, title, body, data = {}) {
  const results = await Promise.allSettled(
    tokens.map(token => sendPushNotification(token, title, body, data))
  );

  const invalidTokens = [];
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    if (r.status !== 'rejected') continue;

    const msg = String(r.reason?.message || r.reason || '');
    // FCM permanent token errors: cleanup local token to avoid repeated failures.
    const isUnregistered = msg.includes('"errorCode":"UNREGISTERED"');
    const isInvalidToken = msg.includes('"errorCode":"INVALID_ARGUMENT"') || msg.includes('registration token is not a valid FCM registration token');
    if (isUnregistered || isInvalidToken) {
      invalidTokens.push(tokens[i]);
    }
  }
  
  return {
    success: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
    invalidTokens,
    details: results,
  };
}

/**
 * Envoyer une notification à un topic
 * @param {string} topic - Nom du topic
 * @param {string} title - Titre de la notification
 * @param {string} body - Corps de la notification
 * @param {object} data - Données supplémentaires (optionnel)
 */
async function sendPushToTopic(topic, title, body, data = {}) {
  if (!isFirebaseConfigured()) {
    console.warn('[FIREBASE] Non configuré, notification topic ignorée:', { topic, title });
    return { success: false, message: 'Firebase non configuré' };
  }
  
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { success: false, message: 'Impossible d\'obtenir le token Firebase' };
  }
  
  // Firebase FCM requiert que toutes les valeurs de 'data' soient des strings
  const stringData = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && value !== undefined) {
      stringData[key] = String(value);
    }
  }
  
  const message = {
    message: {
      topic: topic,
      notification: {
        title: title,
        body: body,
      },
      data: stringData,
      android: {
        priority: 'high',
        notification: {
          channel_id: 'fcm_default_channel',
          sound: 'default',
        },
      },
    },
  };

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    }
  );

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(`FCM Error: ${JSON.stringify(result)}`);
  }
  
  return result;
}

module.exports = {
  sendPushNotification,
  sendPushToMultiple,
  sendPushToTopic,
  getAccessToken,
  isFirebaseConfigured,
  removeInvalidTokens,
};
