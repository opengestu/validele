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

/**
 * Notifier le vendeur d'une nouvelle commande
 */
async function notifyVendorNewOrder(vendorId, orderDetails) {
  const user = await getUserPushToken(vendorId);
  if (!user?.token) return { sent: false, reason: 'no_token' };

  try {
    const result = await sendPushNotification(
      user.token,
      '🛒 Nouvelle commande!',
      `Commande de ${orderDetails.buyerName || 'un client'} - ${orderDetails.productName} (${orderDetails.amount} FCFA)`,
      { 
        type: 'new_order', 
        orderId: orderDetails.orderId,
        click_action: 'OPEN_VENDOR_DASHBOARD'
      }
    );
    console.log(`[NOTIF] Vendeur ${vendorId} notifié - nouvelle commande`);
    return { sent: true, result };
  } catch (error) {
    console.error(`[NOTIF] Erreur notification vendeur:`, error.message);
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
      `Votre commande ${orderDetails.orderCode || ''} a été confirmée par le vendeur.`,
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
  if (!user?.token) return { sent: false, reason: 'no_token' };

  try {
    const result = await sendPushNotification(
      user.token,
      '🚗 Livraison en cours!',
      `Votre commande ${orderDetails.orderCode || ''} est en route vers vous.`,
      { 
        type: 'delivery_started', 
        orderId: orderDetails.orderId,
        click_action: 'OPEN_ORDER_TRACKING'
      }
    );
    console.log(`[NOTIF] Acheteur ${buyerId} notifié - livraison en cours`);
    return { sent: true, result };
  } catch (error) {
    console.error(`[NOTIF] Erreur notification acheteur:`, error.message);
    return { sent: false, error: error.message };
  }
}

/**
 * Notifier que la livraison est terminée (vendeur + acheteur)
 */
async function notifyDeliveryCompleted(vendorId, buyerId, orderDetails) {
  const results = { vendor: null, buyer: null };

  // Notifier le vendeur
  const vendor = await getUserPushToken(vendorId);
  if (vendor?.token) {
    try {
      results.vendor = await sendPushNotification(
        vendor.token,
        '✅ Livraison effectuée!',
        `La commande ${orderDetails.orderCode || ''} a été livrée avec succès.`,
        { 
          type: 'delivery_completed', 
          orderId: orderDetails.orderId,
          click_action: 'OPEN_VENDOR_DASHBOARD'
        }
      );
      console.log(`[NOTIF] Vendeur ${vendorId} notifié - livraison terminée`);
    } catch (error) {
      console.error(`[NOTIF] Erreur notification vendeur:`, error.message);
    }
  }

  // Notifier l'acheteur
  const buyer = await getUserPushToken(buyerId);
  if (buyer?.token) {
    try {
      results.buyer = await sendPushNotification(
        buyer.token,
        '🎉 Commande livrée!',
        `Votre commande ${orderDetails.orderCode || ''} a été livrée. Merci pour votre confiance!`,
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
      `Votre commande ${orderDetails.orderCode || ''} est prête et attend un livreur.`,
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
  notifyBuyerOrderReady
};
