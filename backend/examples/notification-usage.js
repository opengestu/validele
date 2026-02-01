// backend/examples/notification-usage.js
// Exemples d'utilisation des notifications contextuelles
// Date: 1er Février 2026

const { getNotificationTemplate } = require('../notification-templates');
const { sendPushNotification } = require('../firebase-push');
const { supabase } = require('../supabase');

/**
 * EXEMPLE 1: Notifier un acheteur qu'une commande a été créée
 */
async function notifyOrderCreated(order) {
  const notification = getNotificationTemplate('ORDER_CREATED', {
    orderCode: order.order_code,
    amount: order.total_amount,
    orderId: order.id
  });

  // Récupérer le token FCM de l'acheteur
  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', order.buyer_id);

  if (tokens && tokens.length > 0) {
    for (const { token } of tokens) {
      try {
        await sendPushNotification(
          token,
          notification.title,
          notification.body,
          notification.data
        );
        console.log(`[NOTIF] Order created sent to buyer ${order.buyer_id}`);
      } catch (error) {
        console.error(`[NOTIF] Error sending to buyer:`, error.message);
      }
    }
  }
}

/**
 * EXEMPLE 2: Notifier un vendeur d'une nouvelle commande
 */
async function notifyNewOrderToVendor(order, product) {
  const notification = getNotificationTemplate('NEW_ORDER_VENDOR', {
    orderCode: order.order_code,
    amount: order.total_amount,
    productName: product.name,
    orderId: order.id
  });

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', order.vendor_id);

  if (tokens && tokens.length > 0) {
    for (const { token } of tokens) {
      try {
        await sendPushNotification(
          token,
          notification.title,
          notification.body,
          notification.data
        );
        console.log(`[NOTIF] New order sent to vendor ${order.vendor_id}`);
      } catch (error) {
        console.error(`[NOTIF] Error sending to vendor:`, error.message);
      }
    }
  }
}

/**
 * EXEMPLE 3: Notifier un livreur d'une nouvelle livraison
 */
async function notifyDeliveryAssigned(order, vendor, buyer) {
  const notification = getNotificationTemplate('NEW_DELIVERY_ASSIGNED', {
    orderCode: order.order_code,
    vendorName: vendor.full_name,
    vendorPhone: vendor.phone,
    buyerAddress: order.delivery_address,
    orderId: order.id
  });

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', order.delivery_person_id);

  if (tokens && tokens.length > 0) {
    for (const { token } of tokens) {
      try {
        await sendPushNotification(
          token,
          notification.title,
          notification.body,
          notification.data
        );
        console.log(`[NOTIF] Delivery assigned sent to ${order.delivery_person_id}`);
      } catch (error) {
        console.error(`[NOTIF] Error sending to delivery:`, error.message);
      }
    }
  }
}

/**
 * EXEMPLE 4: Notifier toutes les parties d'un changement de statut
 */
async function notifyOrderStatusChange(order, newStatus) {
  const notifications = {
    'in_delivery': {
      buyer: 'ORDER_IN_DELIVERY',
      delivery: 'DELIVERY_REMINDER'
    },
    'delivered': {
      buyer: 'ORDER_DELIVERED'
    },
    'cancelled': {
      buyer: 'ORDER_CANCELLED',
      vendor: 'ORDER_CANCELLED'
    }
  };

  const statusNotifs = notifications[newStatus];
  if (!statusNotifs) return;

  // Notifier l'acheteur
  if (statusNotifs.buyer) {
    const buyerNotif = getNotificationTemplate(statusNotifs.buyer, {
      orderCode: order.order_code,
      orderId: order.id,
      amount: order.total_amount
    });

    const { data: buyerTokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', order.buyer_id);

    if (buyerTokens) {
      for (const { token } of buyerTokens) {
        await sendPushNotification(token, buyerNotif.title, buyerNotif.body, buyerNotif.data);
      }
    }
  }

  // Notifier le vendeur si applicable
  if (statusNotifs.vendor) {
    const vendorNotif = getNotificationTemplate(statusNotifs.vendor, {
      orderCode: order.order_code,
      orderId: order.id,
      reason: order.cancellation_reason
    });

    const { data: vendorTokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', order.vendor_id);

    if (vendorTokens) {
      for (const { token } of vendorTokens) {
        await sendPushNotification(token, vendorNotif.title, vendorNotif.body, vendorNotif.data);
      }
    }
  }
}

/**
 * EXEMPLE 5: Notifier un paiement de vendeur
 */
async function notifyVendorPayout(vendorId, amount, orderCode, method = 'Wave') {
  const notification = getNotificationTemplate('PAYOUT_PAID', {
    amount,
    orderCode,
    method,
    orderId: null
  });

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', vendorId);

  if (tokens && tokens.length > 0) {
    for (const { token } of tokens) {
      try {
        await sendPushNotification(
          token,
          notification.title,
          notification.body,
          notification.data
        );
        console.log(`[NOTIF] Payout notification sent to vendor ${vendorId}`);
      } catch (error) {
        console.error(`[NOTIF] Error sending payout notification:`, error.message);
      }
    }
  }
}

/**
 * EXEMPLE 6: Notifier un lot de paiement terminé
 */
async function notifyBatchPayoutCompleted(batchId, vendorIds, totalAmount, successCount) {
  const notification = getNotificationTemplate('BATCH_PAYOUT_COMPLETED', {
    batchId,
    totalAmount,
    successCount
  });

  for (const vendorId of vendorIds) {
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', vendorId);

    if (tokens && tokens.length > 0) {
      for (const { token } of tokens) {
        try {
          await sendPushNotification(
            token,
            notification.title,
            notification.body,
            notification.data
          );
        } catch (error) {
          console.error(`[NOTIF] Error in batch notification:`, error.message);
        }
      }
    }
  }
}

// Export des fonctions d'exemple
module.exports = {
  notifyOrderCreated,
  notifyNewOrderToVendor,
  notifyDeliveryAssigned,
  notifyOrderStatusChange,
  notifyVendorPayout,
  notifyBatchPayoutCompleted
};
