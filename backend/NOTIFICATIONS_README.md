# 📚 Documentation Backend Validèle - Notifications Push

## Vue d'Ensemble

Ce dossier contient toute la documentation relative au système de notifications push Firebase intégré dans le backend Validèle.

## 🚀 Démarrage Rapide

1. **Configuration initiale**: Voir [SETUP_FIREBASE_RENDER.md](SETUP_FIREBASE_RENDER.md)
2. **Guide d'intégration**: Voir [INTEGRATION_COMPLETE.md](INTEGRATION_COMPLETE.md)
3. **Déploiement**: Voir [DEPLOIEMENT_NOTIFICATIONS.md](DEPLOIEMENT_NOTIFICATIONS.md)

## 📁 Structure de la Documentation

### Configuration & Setup

- **[SETUP_FIREBASE_RENDER.md](SETUP_FIREBASE_RENDER.md)**
  - Configuration Firebase Cloud Messaging
  - Génération des credentials Base64
  - Configuration des variables d'environnement Render
  - Résolution des problèmes courants

- **[CREATE_PUSH_TOKENS_TABLE.md](CREATE_PUSH_TOKENS_TABLE.md)**
  - Création de la table push_tokens dans Supabase
  - Politiques Row Level Security (RLS)
  - Triggers et indexes
  - Migration des tokens existants

### Guide d'Utilisation

- **[GUIDE_NOTIFICATIONS_PUSH.md](GUIDE_NOTIFICATIONS_PUSH.md)**
  - Introduction aux notifications push
  - Architecture du système
  - API endpoints disponibles
  - Exemples de code

- **[notification-templates.js](notification-templates.js)**
  - 20+ templates de notifications prédéfinis
  - Fonction getNotificationTemplate()
  - Templates par rôle (acheteur, vendeur, livreur, admin)

- **[examples/notification-usage.js](examples/notification-usage.js)**
  - Exemples pratiques d'utilisation
  - Cas d'usage par endpoint
  - Bonnes pratiques

### Intégration & Déploiement

- **[INTEGRATION_NOTIFICATIONS.md](INTEGRATION_NOTIFICATIONS.md)**
  - Guide d'intégration dans server.js
  - Points d'intégration identifiés
  - Pattern de code recommandé

- **[INTEGRATION_COMPLETE.md](INTEGRATION_COMPLETE.md)** ⭐
  - **Récapitulatif complet de l'intégration**
  - 8 points d'intégration documentés
  - 9 types de notifications implémentés
  - Scénarios de test
  - Statistiques et métriques

- **[DEPLOIEMENT_NOTIFICATIONS.md](DEPLOIEMENT_NOTIFICATIONS.md)** 🚀
  - **Guide de déploiement étape par étape**
  - Commandes Git
  - Tests post-déploiement
  - Monitoring et debugging
  - Rollback si nécessaire

### Scripts & Fichiers Techniques

- **[scripts/create_push_tokens_table.sql](scripts/create_push_tokens_table.sql)**
  - Script SQL de création de table

- **[scripts/migrate_push_tokens.sql](scripts/migrate_push_tokens.sql)**
  - Script de migration des tokens existants

- **[firebase-push.js](firebase-push.js)**
  - Module principal Firebase
  - Fonction sendPushNotification()
  - Conversion des données en strings (fix FCM)

## 🎯 Fonctionnalités Implémentées

### Types de Notifications (9)

1. **ORDER_CREATED** - Confirmation de création de commande (acheteur)
2. **NEW_ORDER_VENDOR** - Nouvelle commande reçue (vendeur)
3. **PAYMENT_CONFIRMED** - Paiement confirmé (acheteur)
4. **PAYMENT_RECEIVED** - Paiement reçu (vendeur)
5. **ORDER_IN_DELIVERY** - Commande en livraison (acheteur)
6. **ORDER_DELIVERED** - Commande livrée (acheteur)
7. **PAYOUT_REQUESTED** - Demande de paiement vendeur (vendeur)
8. **PAYOUT_PROCESSING** - Paiement vendeur en cours (vendeur)
9. **PAYOUT_PAID** - Paiement vendeur effectué (vendeur)

### Endpoints Intégrés (6)

1. **POST /api/orders** (Ligne 4171)
2. **POST /api/payments/create-order-and-invoice** (Ligne 4518)
3. **POST /api/payment/pixpay-webhook** (Ligne 1667)
4. **POST /api/orders/mark-in-delivery** (Ligne 3895)
5. **POST /api/orders/mark-delivered** (Ligne 4120)
6. **POST /api/admin/payout-order** (Ligne 2531)

## 📊 État Actuel

### ✅ Complété

- [x] Configuration Firebase sur Render
- [x] Création table push_tokens dans Supabase
- [x] Migration de 5 utilisateurs avec tokens FCM
- [x] Fix du format de données Firebase (boolean → string)
- [x] Création de 20+ templates de notifications
- [x] Intégration dans 6 endpoints critiques
- [x] Documentation complète (6 guides)
- [x] Gestion d'erreurs complète
- [x] Logs de monitoring
- [x] Tests de validation

### 📈 Métriques

- **Utilisateurs avec tokens FCM actifs**: 5
- **Types de notifications**: 9
- **Endpoints intégrés**: 6
- **Lignes de code ajoutées**: ~280
- **Taux de couverture**: 100% des événements critiques

## 🧪 Tests Disponibles

### Test Manuel

```bash
# Endpoint de test admin
curl -X POST https://validele.onrender.com/api/admin/test-push \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "userId": "33d93f4e-9844-4f88-ae23-d33ad0a7caf6",
    "title": "Test",
    "body": "Notification de test"
  }'
```

### Utilisateurs de Test

5 utilisateurs avec tokens FCM actifs (voir VERIFICATION_BACKEND.md):
- Galo Bâ (ID: 33d93...)
- PDG VALIDEL (ID: e27e6...)
- Mbaye Barry (ID: f53fa...)
- Djiby NDIAYE (ID: 2a0c1...)
- Abddourahmane Ndiaye (ID: 48e37...)

## 🔧 Maintenance

### Logs à Surveiller

Dans Render Dashboard > Logs:

```
✅ Succès:
[CREATE-ORDER-SIMPLE] Notification vendeur envoyée
[PIXPAY] Notification paiement confirmé envoyée à l'acheteur
[MARK-IN-DELIVERY] Notification push envoyée à l'acheteur
[MARK-DELIVERED] Notification acheteur envoyée

❌ Erreurs:
[CREATE-ORDER-SIMPLE] Erreur notification vendeur: ...
Firebase non configuré
```

### Debugging

```sql
-- Vérifier les tokens actifs dans Supabase
SELECT user_id, created_at, last_used_at 
FROM push_tokens 
WHERE is_active = true 
ORDER BY created_at DESC;

-- Compter les tokens par utilisateur
SELECT user_id, COUNT(*) as token_count
FROM push_tokens
WHERE is_active = true
GROUP BY user_id;
```

## 📞 Support

### Problèmes Fréquents

1. **"Firebase non configuré"**
   - Vérifier FIREBASE_SERVICE_ACCOUNT_BASE64 dans Render env vars

2. **"Table push_tokens does not exist"**
   - Exécuter scripts/create_push_tokens_table.sql dans Supabase

3. **"Invalid value at message.data" (FCM)**
   - Vérifier que firebase-push.js convertit bien les données en strings

4. **Notifications non reçues**
   - Vérifier que le token FCM existe dans push_tokens
   - Vérifier que is_active = true
   - Tester l'endpoint /api/admin/test-push

### Ressources

- **Firebase Console**: https://console.firebase.google.com/project/validel-d7c83
- **Supabase Dashboard**: https://supabase.com
- **Render Dashboard**: https://dashboard.render.com
- **Documentation FCM**: https://firebase.google.com/docs/cloud-messaging

## 🎓 Guides d'Apprentissage

1. **Débutant**: Commencez par [GUIDE_NOTIFICATIONS_PUSH.md](GUIDE_NOTIFICATIONS_PUSH.md)
2. **Développeur**: Consultez [notification-templates.js](notification-templates.js) et [examples/notification-usage.js](examples/notification-usage.js)
3. **DevOps**: Suivez [DEPLOIEMENT_NOTIFICATIONS.md](DEPLOIEMENT_NOTIFICATIONS.md)
4. **Architecture**: Lisez [INTEGRATION_COMPLETE.md](INTEGRATION_COMPLETE.md)

## 🚀 Roadmap Future

### À Court Terme

- [ ] Tests automatisés (Jest/Mocha)
- [ ] Notifications pour les échecs (paiement échoué, etc.)
- [ ] Statistiques d'envoi (taux de succès, temps de réponse)

### À Moyen Terme

- [ ] Préférences utilisateur (activer/désactiver par type)
- [ ] Notifications groupées pour admins
- [ ] Système de notification in-app (stockage DB)
- [ ] Historique des notifications envoyées

### À Long Terme

- [ ] Support multi-langues (FR/EN)
- [ ] Templates personnalisables
- [ ] A/B testing des messages
- [ ] Analytics avancées (taux d'ouverture, engagement)

## 📝 Changelog

### Version 1.0 (2025-01-02)

- ✅ Intégration complète des notifications contextuelles
- ✅ 9 types de notifications implémentés
- ✅ 6 endpoints intégrés
- ✅ Documentation complète
- ✅ Tests validés
- ✅ Production ready

### Version 0.2 (2025-01-01)

- ✅ Fix du format de données Firebase (boolean → string)
- ✅ Migration de 5 utilisateurs avec tokens

### Version 0.1 (2024-12-31)

- ✅ Configuration Firebase initiale
- ✅ Création table push_tokens
- ✅ Premier test de notification réussi

## 📄 Licence

Ce projet est développé pour **Validèle** - Plateforme d'Escrow Payment au Sénégal.

---

**Dernière mise à jour**: 2025-01-02  
**Version**: 1.0  
**Statut**: ✅ Production Ready
