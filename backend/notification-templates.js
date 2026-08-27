// backend/notification-templates.js
// Templates de notifications contextuelles pour Validele
// Date: 1er Février 2026

/**
 * Templates de notifications par contexte métier
 */
const NOTIFICATION_TEMPLATES = {
  // === NOTIFICATIONS ACHETEUR ===
  ORDER_CREATED: {
    title: '🛍️ Commande créée',
    body: (data) => `Votre commande pour ${data.productName || data.orderCode} a été créée avec succès. Montant: ${data.amount} FCFA`,
    data: (data) => ({
      type: 'order_created',
      order_id: data.orderId,
      order_code: data.orderCode,
      product_name: data.productName,
      amount: data.amount,
      screen: 'OrderDetails'
    })
  },

  PAYMENT_CONFIRMED: {
    title: '✅ Paiement confirmé',
    body: (data) => `Votre paiement de ${data.amount} FCFA pour le produit "${data.productName}" a été confirmé.`,
    data: (data) => ({
      type: 'payment_confirmed',
      order_id: data.orderId,
      order_code: data.orderCode, // conservé pour compatibilité, mais non affiché
      product_name: data.productName,
      amount: data.amount,
      screen: 'OrderDetails'
    })
  },

  ORDER_ASSIGNED_TO_DELIVERY: {
    title: '🚚 Livreur assigné',
    body: (data) => `${data.deliveryName} va livrer votre commande pour ${data.productName || data.orderCode}. Contact: ${data.deliveryPhone}`,
    data: (data) => ({
      type: 'delivery_assigned',
      order_id: data.orderId,
      order_code: data.orderCode,
      product_name: data.productName,
      delivery_name: data.deliveryName,
      delivery_phone: data.deliveryPhone,
      screen: 'OrderTracking'
    })
  },

  ORDER_IN_DELIVERY: {
    title: '📦 En cours de livraison',
    body: (data) => `Votre commande pour ${data.productName || data.orderCode} est en cours de livraison. Arrivée prévue sous peu.`,
    data: (data) => ({
      type: 'in_delivery',
      order_id: data.orderId,
      order_code: data.orderCode,
      product_name: data.productName,
      screen: 'OrderTracking'
    })
  },

  ORDER_DELIVERED: {
    title: '🎉 Commande livrée',
    body: (data) => `Votre commande pour ${data.productName || data.orderCode} a été livrée avec succès! Merci pour votre confiance.`,
    data: (data) => ({
      type: 'order_delivered',
      order_id: data.orderId,
      order_code: data.orderCode,
      product_name: data.productName,
      screen: 'OrderDetails'
    })
  },

  ORDER_CANCELLED: {
    title: '❌ Commande annulée',
    body: (data) => `Votre commande pour ${data.productName || data.orderCode} a été annulée. ${data.reason || 'Raison non spécifiée'}`,
    data: (data) => ({
      type: 'order_cancelled',
      order_id: data.orderId,
      order_code: data.orderCode,
      product_name: data.productName,
      reason: data.reason,
      screen: 'OrderDetails'
    })
  },

  // === NOTIFICATIONS VENDEUR ===
  NEW_ORDER_VENDOR: {
    title: '🔔 Nouvelle commande',
      body: (data) => `Vous avez une nouvelle commande de "${data.productName}". Montant: ${data.amount} FCFA.`,
    data: (data) => ({
      type: 'new_order_vendor',
      order_id: data.orderId,
      order_code: data.orderCode,
      amount: data.amount,
      product_name: data.productName,
      screen: 'VendorOrders'
    })
  },

  PAYOUT_REQUESTED: {
    title: '💰 Demande de paiement',
    // `amount` est optionnel : sans garde, un appelant qui l'oublie envoyait
    // littéralement « Montant: undefined FCFA » au vendeur.
    body: (data) => `Demande de paiement pour ${data.productName || data.orderCode}.`
      + (data.amount != null ? ` Montant: ${data.amount} FCFA` : ''),
    data: (data) => ({
      type: 'payout_requested',
      order_id: data.orderId,
      order_code: data.orderCode,
      product_name: data.productName,
      amount: data.amount,
      screen: 'VendorPayouts'
    })
  },

  // Vendeur : la livraison est confirmée par l'acheteur. C'est LE moment où le
  // vendeur veut savoir que sa vente est allée au bout — l'ancienne notification
  // ne parlait que de paiement, jamais de livraison.
  ORDER_DELIVERED_VENDOR: {
    title: '🎉 Commande livrée',
    body: (data) => `${data.productName || data.orderCode} a été livrée et confirmée par l'acheteur.`
      + (data.amount != null ? ` Votre paiement de ${data.amount} FCFA est en préparation.` : ' Votre paiement est en préparation.'),
    data: (data) => ({
      type: 'order_delivered_vendor',
      order_id: data.orderId,
      order_code: data.orderCode,
      product_name: data.productName,
      amount: data.amount,
      screen: 'VendorPayouts'
    })
  },

  PAYOUT_PAID: {
    title: '✅ Paiement effectué',
    body: (data) => `Vous avez reçu ${data.amount} FCFA pour ${data.productName || data.orderCode} via ${data.method}`,
    data: (data) => ({
      type: 'payout_paid',
      order_id: data.orderId,
      order_code: data.orderCode,
      product_name: data.productName,
      amount: data.amount,
      method: data.method,
      screen: 'VendorPayouts'
    })
  },

  // Vendor payment received after buyer payment (distinct from payout)
  PAYMENT_RECEIVED: {
    title: '💰 Paiement reçu',
    body: (data) => `Vous avez reçu ${data.amount} FCFA pour ${data.productName || data.orderCode}`,
    data: (data) => ({
      type: 'payment_received',
      order_id: data.orderId,
      order_code: data.orderCode,
      product_name: data.productName,
      amount: data.amount,
      screen: 'VendorOrders'
    })
  },

  BATCH_PAYOUT_PROCESSING: {
    title: '💳 Lot de paiement en cours',
    body: (data) => `Votre lot de paiement #${data.batchId} est en cours de traitement. Montant total: ${data.totalAmount} FCFA`,
    data: (data) => ({
      type: 'batch_payout_processing',
      batch_id: data.batchId,
      total_amount: data.totalAmount,
      screen: 'VendorPayouts'
    })
  },

  BATCH_PAYOUT_COMPLETED: {
    title: '✅ Lot de paiement terminé',
    body: (data) => `Lot #${data.batchId} payé avec succès. ${data.successCount} paiements effectués.`,
    data: (data) => ({
      type: 'batch_payout_completed',
      batch_id: data.batchId,
      success_count: data.successCount,
      total_amount: data.totalAmount,
      screen: 'VendorPayouts'
    })
  },

  // === NOTIFICATIONS LIVREUR ===
  NEW_DELIVERY_ASSIGNED: {
    title: '📦 Nouvelle livraison',
    body: (data) => `Nouvelle livraison pour ${data.productName || data.orderCode} assignée. Récupérer chez ${data.vendorName}`,
    data: (data) => ({
      type: 'delivery_assigned',
      order_id: data.orderId,
      order_code: data.orderCode,
      product_name: data.productName,
      vendor_name: data.vendorName,
      vendor_phone: data.vendorPhone,
      buyer_address: data.buyerAddress,
      screen: 'DeliveryOrders'
    })
  },

  DELIVERY_REMINDER: {
    title: '⏰ Rappel de livraison',
    body: (data) => `N'oubliez pas de livrer ${data.productName || data.orderCode}. Client: ${data.buyerPhone}`,
    data: (data) => ({
      type: 'delivery_reminder',
      order_id: data.orderId,
      order_code: data.orderCode,
      product_name: data.productName,
      buyer_phone: data.buyerPhone,
      screen: 'DeliveryDetails'
    })
  },

  DELIVERY_PAYMENT_RECEIVED: {
    title: '💰 Paiement reçu',
    body: (data) => `Vous avez reçu ${data.amount} FCFA pour ${data.productName || data.orderCode}`,
    data: (data) => ({
      type: 'delivery_payment',
      order_id: data.orderId,
      order_code: data.orderCode,
      product_name: data.productName,
      amount: data.amount,
      screen: 'DeliveryPayouts'
    })
  },

  // === NOTIFICATIONS ADMIN ===
  PAYOUT_APPROVAL_NEEDED: {
    title: '⚠️ Approbation requise',
    body: (data) => `${data.count} demande(s) de paiement en attente d'approbation`,
    data: (data) => ({
      type: 'payout_approval',
      count: data.count,
      screen: 'AdminPayouts'
    })
  },

  PAYMENT_FAILED: {
    title: '❌ Échec de paiement',
    body: (data) => `Le paiement pour le produit "${data.productName}" a échoué. Montant: ${data.amount} FCFA`,
    data: (data) => ({
      type: 'payment_failed',
      order_id: data.orderId,
      order_code: data.orderCode, // conservé pour compatibilité, mais non affiché
      product_name: data.productName,
      amount: data.amount,
      error: data.error,
      screen: 'AdminOrders'
    })
  },

  SYSTEM_ALERT: {
    title: '🚨 Alerte système',
    body: (data) => data.message,
    data: (data) => ({
      type: 'system_alert',
      severity: data.severity,
      message: data.message,
      screen: 'AdminDashboard'
    })
  },

  // === NOTIFICATIONS GÉNÉRALES ===
  WELCOME: {
    title: '👋 Bienvenue sur Validele',
    body: (data) => `Bienvenue ${data.userName}! Votre compte ${data.role} est activé.`,
    data: (data) => ({
      type: 'welcome',
      role: data.role,
      screen: 'Home'
    })
  },

  ACCOUNT_VERIFIED: {
    title: '✅ Compte vérifié',
    body: (data) => `Votre compte ${data.userName} a été vérifié avec succès.`,
    data: (data) => ({
      type: 'account_verified',
      screen: 'Profile'
    })
  },

  PROMOTION: {
    title: '🎁 Offre spéciale',
    body: (data) => data.message,
    data: (data) => ({
      type: 'promotion',
      promo_code: data.promoCode,
      screen: 'Promotions'
    })
  }
};

/**
 * Obtenir un template de notification
 * @param {string} type - Type de notification (clé de NOTIFICATION_TEMPLATES)
 * @param {object} data - Données pour personnaliser le template
 * @returns {object} - { title, body, data }
 */
function getNotificationTemplate(type, data = {}) {
  const template = NOTIFICATION_TEMPLATES[type];
  
  if (!template) {
    console.warn(`[NOTIF TEMPLATE] Type inconnu: ${type}`);
    return {
      title: 'Notification',
      body: 'Vous avez une nouvelle notification',
      data: { type: 'unknown', screen: 'Home' }
    };
  }

  try {
    return {
      title: typeof template.title === 'function' ? template.title(data) : template.title,
      body: typeof template.body === 'function' ? template.body(data) : template.body,
      data: typeof template.data === 'function' ? template.data(data) : template.data
    };
  } catch (error) {
    console.error(`[NOTIF TEMPLATE] Erreur génération template ${type}:`, error);
    return {
      title: template.title,
      body: 'Erreur de génération du message',
      data: { type, error: error.message }
    };
  }
}

/**
 * Liste des types de notifications par rôle
 */
const NOTIFICATIONS_BY_ROLE = {
  buyer: [
    'ORDER_CREATED',
    'PAYMENT_CONFIRMED',
    'ORDER_ASSIGNED_TO_DELIVERY',
    'ORDER_IN_DELIVERY',
    'ORDER_DELIVERED',
    'ORDER_CANCELLED',
    'WELCOME',
    'ACCOUNT_VERIFIED',
    'PROMOTION'
  ],
  vendor: [
    'NEW_ORDER_VENDOR',
    'ORDER_DELIVERED_VENDOR',
    'PAYOUT_REQUESTED',
    'PAYOUT_PAID',
    'BATCH_PAYOUT_PROCESSING',
    'BATCH_PAYOUT_COMPLETED',
    'WELCOME',
    'ACCOUNT_VERIFIED',
    'PROMOTION'
  ],
  delivery: [
    'NEW_DELIVERY_ASSIGNED',
    'DELIVERY_REMINDER',
    'DELIVERY_PAYMENT_RECEIVED',
    'WELCOME',
    'ACCOUNT_VERIFIED',
    'PROMOTION'
  ],
  admin: [
    'PAYOUT_APPROVAL_NEEDED',
    'PAYMENT_FAILED',
    'SYSTEM_ALERT',
    'WELCOME'
  ]
};

module.exports = {
  NOTIFICATION_TEMPLATES,
  NOTIFICATIONS_BY_ROLE,
  getNotificationTemplate
};
