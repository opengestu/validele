// Fonction d'envoi de SMS via D7Direct (token notification)
async function sendD7SMSNotify(to, text) {
  const D7_API_KEY = process.env.D7_API_KEY_NOTIFY;
  const D7_SMS_URL = process.env.D7_SMS_URL || 'https://api.d7networks.com/messages/v1/send';
  if (!D7_API_KEY) throw new Error('D7_API_KEY_NOTIFY not configured');
  // D7 attend un numéro sans symbole '+'
  const formattedTo = String(to || '').replace(/[^0-9]/g, '');
  if (!formattedTo) throw new Error('Numéro SMS invalide');
  const data = {
    messages: [
      {
        channel: "sms",
        recipients: [formattedTo],
        content: text,
        msg_type: "text",
        data_coding: "text"
      }
    ],
    message_globals: {
      originator: "VALIDEL"
    }
  };
  const res = await fetch(D7_SMS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${D7_API_KEY}`,
    },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({ status: res.status }));
  return { ok: res.ok, status: res.status, body: json };
}
// backend/notification-service.js
// Service de notifications automatiques pour les événements de commande

const { sendPushNotification } = require('./firebase-push');
const { createClient } = require('@supabase/supabase-js');

// Initialiser Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('[NOTIF] Variables Supabase manquantes - notifications désactivées');
}

const supabase = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

const DELIVERY_STARTED_SMS_DELAY_MS = 2 * 60 * 1000;
const DELIVERY_STARTED_ACTIVE_THRESHOLD_MS = 2 * 60 * 1000;
const deliveryStartedSmsTimers = new Map();

/**
 * Récupérer le token push d'un utilisateur
 */
async function getUserPushToken(userId) {
  if (!supabase) return null;
  
  const { data, error } = await supabase
    .from('profiles')
    .select('push_token, full_name')
    .eq('id', userId)
    .single();

  if (error || !data?.push_token) {
    console.log(`[NOTIF] Pas de token pour user ${userId}`);
    return null;
  }

  return { token: data.push_token, name: data.full_name };
}

async function getUserPresence(userId) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('phone, full_name, last_seen_at')
    .eq('id', userId)
    .single();

  if (error || !data) return null;

  const lastSeenAtMs = Date.parse(data.last_seen_at || '');
  return {
    phone: data.phone || null,
    fullName: data.full_name || null,
    lastSeenAtMs: Number.isFinite(lastSeenAtMs) ? lastSeenAtMs : null
  };
}

async function isUserActiveRecently(userId, thresholdMs = DELIVERY_STARTED_ACTIVE_THRESHOLD_MS) {
  const presence = await getUserPresence(userId);
  if (!presence?.lastSeenAtMs) return false;
  return (Date.now() - presence.lastSeenAtMs) <= thresholdMs;
}

async function sendDeliveryStartedSmsIfNeeded(buyerId, orderDetails, phoneOverride = null) {
  const recent = await isUserActiveRecently(buyerId, DELIVERY_STARTED_ACTIVE_THRESHOLD_MS);
  if (recent) {
    console.log(`[NOTIF] SMS livraison en cours annulé pour ${buyerId} (actif récemment)`);
    return { sent: false, reason: 'active_recently' };
  }

  const presence = await getUserPresence(buyerId);
  const phone = phoneOverride || orderDetails.buyerPhone || presence?.phone;
  if (!phone) {
    console.warn(`[NOTIF] Pas de numéro pour user ${buyerId}, SMS livraison en cours non envoyé.`);
    return { sent: false, reason: 'no_phone' };
  }

  const productName = orderDetails.productName || 'votre produit';
  const smsText = `Votre Produit "${productName}" sur Validel est en cours de livraison.`;
  const smsResult = await sendD7SMSNotify(phone, smsText);
  console.log(`[NOTIF] Acheteur ${buyerId} notifié (SMS différé) - livraison en cours`, smsResult);
  return { sent: true, smsResult };
}

// Utility to send a push to a user id with a simple interface
async function sendPushNotificationToUser(userId, title, body, data = {}) {
  const user = await getUserPushToken(userId);
  if (!user?.token) return { sent: false, reason: 'no_token' };
  try {
    const result = await sendPushNotification(user.token, title, body, data);
    return { sent: true, result };
  } catch (err) {
    console.error('[NOTIF] Error push to user:', err?.message || err);
    return { sent: false, error: err?.message || err };
  }
}

module.exports = {
  getUserPushToken,
  notifyVendorNewOrder,
  notifyBuyerOrderConfirmed,
  notifyDeliveryPersonAssigned,
  notifyBuyerDeliveryStarted,
  notifyDeliveryCompleted,
  notifyBuyerOrderReady,
  notifyBuyerPaymentFailed,
  sendPushNotificationToUser,
  // Exporter une API SMS simple attendue par le serveur
  sendSMS: sendD7SMSNotify,
  // Expose également la fonction originale si besoin
  sendD7SMSNotify
};

/**
 * Notifier le Vendeur(se) d'une nouvelle commande
 */
async function notifyVendorNewOrder(vendorId, orderDetails) {
  const user = await getUserPushToken(vendorId);
  if (!user?.token) return { sent: false, reason: 'no_token' };

  try {
    const result = await sendPushNotification(
      user.token,
      '🛒 Nouvelle commande dans Validel!',
      `Commande de ${orderDetails.buyerName || 'un client'} - ${orderDetails.productName} (${orderDetails.amount} FCFA)`,
      { 
        type: 'new_order', 
        orderId: orderDetails.orderId,
        click_action: 'OPEN_VENDOR_DASHBOARD'
      }
    );
    console.log(`[NOTIF] Vendeur(se) ${vendorId} notifié - nouvelle commande`);
    return { sent: true, result };
  } catch (error) {
    console.error(`[NOTIF] Erreur notification vendeur(se):`, error.message);
    return { sent: false, error: error.message };
  }
}

/**
 * Notifier l'acheteur que sa commande est confirmée
 */
async function notifyBuyerOrderConfirmed(buyerId, orderDetails) {
  const user = await getUserPushToken(buyerId);
  if (!user?.token) return { sent: false, reason: 'no_token' };

  try {
    const result = await sendPushNotification(
      user.token,
      '✅ Commande confirmée!',
      `Votre commande ${orderDetails.productName || 'votre produit'} a été confirmée par le vendeur(se).`,
      { 
        type: 'order_confirmed', 
        orderId: orderDetails.orderId,
        click_action: 'OPEN_ORDER_TRACKING'
      }
    );
    console.log(`[NOTIF] Acheteur ${buyerId} notifié - commande confirmée`);
    return { sent: true, result };
  } catch (error) {
    console.error(`[NOTIF] Erreur notification acheteur:`, error.message);
    return { sent: false, error: error.message };
  }
}

/**
 * Notifier l'acheteur que le paiement a échoué (sensibiliser à réessayer)
 */
async function notifyBuyerPaymentFailed(buyerId, orderDetails) {
  const user = await getUserPushToken(buyerId);
  let smsResult = null;
  let pushResult = null;

  if (user?.token) {
    try {
      pushResult = await sendPushNotification(
        user.token,
        '❌ Paiement échoué',
        `Le paiement de votre commande ${orderDetails.productName || 'votre produit'} a échoué. Veuillez réessayer dans l'application.`,
        {
          type: 'payment_failed',
          orderId: orderDetails.orderId,
          click_action: 'OPEN_ORDER_TRACKING'
        }
      );
      console.log(`[NOTIF] Acheteur ${buyerId} notifié - paiement échoué`);
    } catch (error) {
      console.error(`[NOTIF] Erreur notification push paiement échoué:`, error?.message || error);
    }
  }

  // Par design : ne PAS envoyer de SMS pour les paiements échoués ou en pending.
  // Les SMS ne sont envoyés que pour les notifications de type "order in progress" ou pour l'inscription OTP.
  // Nous conservons ici un log clair pour indiquer qu'on n'envoie pas de SMS sur échec de paiement.
  console.log('[NOTIF] SMS pour paiement échoué désactivé par configuration (aucun SMS envoyé)');

  return { sent: !!(pushResult || smsResult), pushResult, smsResult };
}

/**
 * Notifier le livreur qu'une commande lui est assignée
 */
async function notifyDeliveryPersonAssigned(deliveryPersonId, orderDetails) {
  const user = await getUserPushToken(deliveryPersonId);
  if (!user?.token) return { sent: false, reason: 'no_token' };

  try {
    const result = await sendPushNotification(
      user.token,
      '📦 Nouvelle livraison assignée!',
      `Livraison vers ${orderDetails.deliveryAddress} - ${orderDetails.productName}`,
      { 
        type: 'delivery_assigned', 
        orderId: orderDetails.orderId,
        click_action: 'OPEN_DELIVERY_DASHBOARD'
      }
    );
    console.log(`[NOTIF] Livreur ${deliveryPersonId} notifié - livraison assignée`);
    return { sent: true, result };
  } catch (error) {
    console.error(`[NOTIF] Erreur notification livreur:`, error.message);
    return { sent: false, error: error.message };
  }
}

/**
 * Notifier l'acheteur que la livraison est en cours
 */
async function notifyBuyerDeliveryStarted(buyerId, orderDetails) {
  const user = await getUserPushToken(buyerId);
  let pushResult = null;
  // Prefer buyerPhone provided in orderDetails, else try to fetch from profiles
  let phone = orderDetails.buyerPhone || null;
  if (!phone && supabase) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', buyerId)
        .single();
      if (!error && data?.phone) phone = data.phone;
    } catch (e) { /* ignore */ }
  }

  // Envoi push
  if (user?.token) {
    try {
      pushResult = await sendPushNotification(
        user.token,
        '🚗 Livraison en cours!',
        `Votre commande ${orderDetails.productName || 'votre produit'} est en route vers vous.`,
        { 
          type: 'delivery_started', 
          orderId: orderDetails.orderId,
          click_action: 'OPEN_ORDER_TRACKING'
        }
      );
      console.log(`[NOTIF] Acheteur ${buyerId} notifié (push) - livraison en cours`);
    } catch (error) {
      console.error(`[NOTIF] Erreur notification push acheteur:`, error.message);
    }
  }

  const timerKey = String(orderDetails.orderId || buyerId);
  const previousTimer = deliveryStartedSmsTimers.get(timerKey);
  if (previousTimer) {
    clearTimeout(previousTimer);
  }

  const timer = setTimeout(async () => {
    try {
      await sendDeliveryStartedSmsIfNeeded(buyerId, orderDetails, phone);
    } catch (error) {
      console.error(`[NOTIF] Erreur SMS différé livraison acheteur:`, error?.message || error);
    } finally {
      deliveryStartedSmsTimers.delete(timerKey);
    }
  }, DELIVERY_STARTED_SMS_DELAY_MS);

  deliveryStartedSmsTimers.set(timerKey, timer);

  return { sent: !!pushResult, pushResult, smsScheduled: true, smsDelayMs: DELIVERY_STARTED_SMS_DELAY_MS };
}

/**
 * Notifier que la livraison est terminée (vendeur(se) + acheteur)
 */
async function notifyDeliveryCompleted(vendorId, buyerId, orderDetails) {
  const results = { vendor: null, buyer: null };

  // Notifier le vendeur(se)
  const vendor = await getUserPushToken(vendorId);
  if (vendor?.token) {
    try {
      results.vendor = await sendPushNotification(
        vendor.token,
        '✅ Livraison effectuée!',
        `La commande ${orderDetails.productName || 'le produit'} a été livrée avec succès.`,
        { 
          type: 'delivery_completed', 
          orderId: orderDetails.orderId,
          click_action: 'OPEN_VENDOR_DASHBOARD'
        }
      );
      console.log(`[NOTIF] Vendeur(se) ${vendorId} notifié - livraison terminée`);
    } catch (error) {
      console.error(`[NOTIF] Erreur notification vendeur(se):`, error.message);
    }
  }

  // Notifier l'acheteur
  const buyer = await getUserPushToken(buyerId);
  if (buyer?.token) {
    try {
      results.buyer = await sendPushNotification(
        buyer.token,
        '🎉 Commande livrée!',
        `Votre commande ${orderDetails.productName || 'votre produit'} a été livrée. Merci pour votre confiance!`,
        { 
          type: 'delivery_completed', 
          orderId: orderDetails.orderId,
          click_action: 'OPEN_ORDER_TRACKING'
        }
      );
      console.log(`[NOTIF] Acheteur ${buyerId} notifié - livraison terminée`);
    } catch (error) {
      console.error(`[NOTIF] Erreur notification acheteur:`, error.message);
    }
  }

  return results;
}

/**
 * Notifier l'acheteur que sa commande est prête pour livraison
 */
async function notifyBuyerOrderReady(buyerId, orderDetails) {
  const user = await getUserPushToken(buyerId);
  if (!user?.token) return { sent: false, reason: 'no_token' };

  try {
    const result = await sendPushNotification(
      user.token,
      '📦 Commande prête!',
      `Votre commande ${orderDetails.productName || 'votre produit'} est prête et attend un livreur.`,
      { 
        type: 'order_ready', 
        orderId: orderDetails.orderId,
        click_action: 'OPEN_ORDER_TRACKING'
      }
    );
    console.log(`[NOTIF] Acheteur ${buyerId} notifié - commande prête`);
    return { sent: true, result };
  } catch (error) {
    console.error(`[NOTIF] Erreur notification acheteur:`, error.message);
    return { sent: false, error: error.message };
  }
}

module.exports = {
  getUserPushToken,
  notifyVendorNewOrder,
  notifyBuyerOrderConfirmed,
  notifyDeliveryPersonAssigned,
  notifyBuyerDeliveryStarted,
  notifyDeliveryCompleted,
  notifyBuyerOrderReady,
  notifyBuyerPaymentFailed,
  sendPushNotificationToUser,
  sendSMS: sendD7SMSNotify,
  sendD7SMSNotify
};
