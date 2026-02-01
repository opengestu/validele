# 🔔 GUIDE D'INTÉGRATION - Notifications Contextuelles

**Créé**: 1er Février 2026  
**Status**: ✅ Prêt à l'emploi

---

## 📚 Fichiers Créés

1. **`notification-templates.js`** - Templates de notifications (20+ types)
2. **`examples/notification-usage.js`** - Exemples d'utilisation

---

## ⚡ UTILISATION RAPIDE

### 1. Import du module

```javascript
const { getNotificationTemplate } = require('./notification-templates');
const { sendPushNotification } = require('./firebase-push');
const { supabase } = require('./supabase');
```

### 2. Envoyer une notification simple

```javascript
// Template de notification
const notification = getNotificationTemplate('ORDER_CREATED', {
  orderCode: 'ABC123',
  amount: 5000,
  orderId: 'uuid-here'
});

// Récupérer les tokens de l'utilisateur
const { data: tokens } = await supabase
  .from('push_tokens')
  .select('token')
  .eq('user_id', userId);

// Envoyer à tous les appareils de l'utilisateur
for (const { token } of tokens) {
  await sendPushNotification(
    token,
    notification.title,
    notification.body,
    notification.data
  );
}
```

---

## 📋 TYPES DE NOTIFICATIONS DISPONIBLES

### 🛍️ Acheteur (Buyer)
- `ORDER_CREATED` - Commande créée
- `PAYMENT_CONFIRMED` - Paiement confirmé
- `ORDER_ASSIGNED_TO_DELIVERY` - Livreur assigné
- `ORDER_IN_DELIVERY` - En cours de livraison
- `ORDER_DELIVERED` - Commande livrée
- `ORDER_CANCELLED` - Commande annulée

### 🏪 Vendeur (Vendor)
- `NEW_ORDER_VENDOR` - Nouvelle commande reçue
- `PAYOUT_REQUESTED` - Demande de paiement
- `PAYOUT_PAID` - Paiement effectué
- `BATCH_PAYOUT_PROCESSING` - Lot en cours
- `BATCH_PAYOUT_COMPLETED` - Lot terminé

### 🚚 Livreur (Delivery)
- `NEW_DELIVERY_ASSIGNED` - Nouvelle livraison
- `DELIVERY_REMINDER` - Rappel de livraison
- `DELIVERY_PAYMENT_RECEIVED` - Paiement reçu

### ⚙️ Admin
- `PAYOUT_APPROVAL_NEEDED` - Approbation requise
- `PAYMENT_FAILED` - Paiement échoué
- `SYSTEM_ALERT` - Alerte système

### 🌟 Général
- `WELCOME` - Bienvenue
- `ACCOUNT_VERIFIED` - Compte vérifié
- `PROMOTION` - Offre spéciale

---

## 💡 EXEMPLES PAR CONTEXTE

### Exemple 1: Nouvelle commande créée

```javascript
// Dans server.js, après création de commande
app.post('/api/orders/create', async (req, res) => {
  // ... création de la commande ...
  
  // Notifier l'acheteur
  const buyerNotif = getNotificationTemplate('ORDER_CREATED', {
    orderCode: order.order_code,
    amount: order.total_amount,
    orderId: order.id
  });
  
  const { data: buyerTokens } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', order.buyer_id);
  
  for (const { token } of buyerTokens || []) {
    await sendPushNotification(token, buyerNotif.title, buyerNotif.body, buyerNotif.data);
  }
  
  // Notifier le vendeur
  const vendorNotif = getNotificationTemplate('NEW_ORDER_VENDOR', {
    orderCode: order.order_code,
    amount: order.total_amount,
    productName: product.name,
    orderId: order.id
  });
  
  const { data: vendorTokens } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', order.vendor_id);
  
  for (const { token } of vendorTokens || []) {
    await sendPushNotification(token, vendorNotif.title, vendorNotif.body, vendorNotif.data);
  }
});
```

### Exemple 2: Changement de statut commande

```javascript
// Dans server.js, après update de statut
app.patch('/api/orders/:id/status', async (req, res) => {
  const { status } = req.body;
  
  // Mise à jour du statut
  await supabase.from('orders').update({ status }).eq('id', orderId);
  
  // Notifications selon le nouveau statut
  if (status === 'in_delivery') {
    // Notifier acheteur: commande en route
    const buyerNotif = getNotificationTemplate('ORDER_IN_DELIVERY', {
      orderCode: order.order_code,
      orderId: order.id
    });
    // ... envoyer ...
    
    // Rappel au livreur
    const deliveryNotif = getNotificationTemplate('DELIVERY_REMINDER', {
      orderCode: order.order_code,
      buyerPhone: order.buyer_phone,
      orderId: order.id
    });
    // ... envoyer ...
  }
  
  if (status === 'delivered') {
    // Notifier acheteur: livraison terminée
    const notif = getNotificationTemplate('ORDER_DELIVERED', {
      orderCode: order.order_code,
      orderId: order.id
    });
    // ... envoyer ...
  }
});
```

### Exemple 3: Paiement vendeur

```javascript
// Dans server.js, après paiement vendeur
app.post('/api/admin/payout', async (req, res) => {
  // ... traitement paiement PixPay ...
  
  if (paymentSuccess) {
    const notif = getNotificationTemplate('PAYOUT_PAID', {
      amount: payoutAmount,
      orderCode: order.order_code,
      method: 'Wave',
      orderId: order.id
    });
    
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', vendorId);
    
    for (const { token } of tokens || []) {
      await sendPushNotification(token, notif.title, notif.body, notif.data);
    }
  }
});
```

### Exemple 4: Assignation livreur

```javascript
// Dans server.js, après assignation livreur
app.post('/api/orders/:id/assign-delivery', async (req, res) => {
  const { delivery_person_id } = req.body;
  
  // Mise à jour de la commande
  await supabase
    .from('orders')
    .update({ delivery_person_id, assigned_at: new Date() })
    .eq('id', orderId);
  
  // Notifier le livreur
  const deliveryNotif = getNotificationTemplate('NEW_DELIVERY_ASSIGNED', {
    orderCode: order.order_code,
    vendorName: vendor.full_name,
    vendorPhone: vendor.phone,
    buyerAddress: order.delivery_address,
    orderId: order.id
  });
  
  const { data: deliveryTokens } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', delivery_person_id);
  
  for (const { token } of deliveryTokens || []) {
    await sendPushNotification(token, deliveryNotif.title, deliveryNotif.body, deliveryNotif.data);
  }
  
  // Notifier l'acheteur
  const buyerNotif = getNotificationTemplate('ORDER_ASSIGNED_TO_DELIVERY', {
    orderCode: order.order_code,
    deliveryName: delivery.full_name,
    deliveryPhone: delivery.phone,
    orderId: order.id
  });
  
  const { data: buyerTokens } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', order.buyer_id);
  
  for (const { token } of buyerTokens || []) {
    await sendPushNotification(token, buyerNotif.title, buyerNotif.body, buyerNotif.data);
  }
});
```

---

## 🔧 PERSONNALISATION

### Ajouter un nouveau type de notification

Dans `notification-templates.js`:

```javascript
CUSTOM_NOTIFICATION: {
  title: '🎯 Titre personnalisé',
  body: (data) => `Message avec ${data.variable}`,
  data: (data) => ({
    type: 'custom_type',
    custom_field: data.customField,
    screen: 'TargetScreen'
  })
}
```

### Modifier un template existant

```javascript
ORDER_CREATED: {
  title: '🎉 Votre commande est créée!',  // Modifier le titre
  body: (data) => `Commande #${data.orderCode} - ${data.amount} FCFA créée avec succès`,
  data: (data) => ({
    type: 'order_created',
    order_id: data.orderId,
    // Ajouter des champs personnalisés
    custom_field: data.customValue
  })
}
```

---

## 📱 GESTION CÔTÉ MOBILE

### React Native / Capacitor

```typescript
// Dans l'app mobile, écouter les notifications
PushNotifications.addListener('pushNotificationReceived', (notification) => {
  const data = notification.data;
  
  // Navigation selon le type
  switch(data.type) {
    case 'order_created':
      navigation.navigate('OrderDetails', { orderId: data.order_id });
      break;
    case 'new_order_vendor':
      navigation.navigate('VendorOrders');
      break;
    case 'delivery_assigned':
      navigation.navigate('DeliveryOrders');
      break;
    default:
      navigation.navigate(data.screen || 'Home');
  }
});
```

---

## 🧪 TESTS

### Tester une notification

```powershell
# Tester notification "commande créée"
Invoke-RestMethod -Uri "https://validele.onrender.com/api/admin/test-notification" `
  -Method Post `
  -ContentType "application/json" `
  -Body (ConvertTo-Json @{
    userId = '78924920-cec1-4839-9e6f-fe9452014dd8'
    type = 'ORDER_CREATED'
    data = @{
      orderCode = 'TEST123'
      amount = '5000'
      orderId = 'test-uuid'
    }
  })
```

### Endpoint de test (à ajouter dans server.js)

```javascript
app.post('/api/admin/test-notification', async (req, res) => {
  const { userId, type, data } = req.body;
  
  const notification = getNotificationTemplate(type, data);
  
  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId);
  
  const results = [];
  for (const { token } of tokens || []) {
    try {
      const result = await sendPushNotification(
        token,
        notification.title,
        notification.body,
        notification.data
      );
      results.push({ success: true, result });
    } catch (error) {
      results.push({ success: false, error: error.message });
    }
  }
  
  res.json({ success: true, results });
});
```

---

## ✅ CHECKLIST D'INTÉGRATION

- [ ] Importer `notification-templates.js` dans `server.js`
- [ ] Ajouter notifications après création de commande
- [ ] Ajouter notifications lors changements de statut
- [ ] Ajouter notifications pour paiements vendeurs
- [ ] Ajouter notifications pour assignations livreur
- [ ] Tester chaque type de notification
- [ ] Configurer navigation mobile selon `data.screen`
- [ ] Ajouter endpoint de test (optionnel)

---

**Documentation créée**: 1er Février 2026  
**Status**: ✅ Production ready  
**Notifications disponibles**: 20+ types contextuels
