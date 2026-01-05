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
    throw new Error('Credentials Firebase manquants (FIREBASE_SERVICE_ACCOUNT_JSON)');
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
  const accessToken = await getAccessToken();
  
  const message = {
    message: {
      token: token,
      notification: {
        title: title,
        body: body,
      },
      data: data,
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
  
  return {
    success: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
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
  const accessToken = await getAccessToken();
  
  const message = {
    message: {
      topic: topic,
      notification: {
        title: title,
        body: body,
      },
      data: data,
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
};
