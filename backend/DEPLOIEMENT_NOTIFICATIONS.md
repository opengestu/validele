# 🚀 Guide de Déploiement - Notifications Contextuelles

## Checklist Avant Déploiement

- [x] Notifications intégrées dans server.js
- [x] notification-templates.js créé et fonctionnel
- [x] firebase-push.js corrigé (conversion string)
- [x] Table push_tokens créée dans Supabase
- [x] 5 utilisateurs avec tokens FCM migrés
- [x] Firebase credentials configurés sur Render
- [x] Aucune erreur de syntaxe

## Étapes de Déploiement

### 1. Commit et Push des Modifications

```bash
cd c:\Users\DELL\Downloads\validele-main1\validele-main

# Vérifier les fichiers modifiés
git status

# Ajouter tous les fichiers modifiés
git add backend/server.js
git add backend/notification-templates.js
git add backend/INTEGRATION_COMPLETE.md
git add backend/DEPLOIEMENT_NOTIFICATIONS.md

# Commit avec un message descriptif
git commit -m "feat: Intégration complète des notifications contextuelles

- Ajout de 9 types de notifications (NEW_ORDER_VENDOR, ORDER_CREATED, PAYMENT_CONFIRMED, etc.)
- Intégration dans 6 endpoints critiques (création commande, paiement, livraison, payout)
- Notifications pour acheteurs (5 types) et vendeurs (6 types)
- Gestion d'erreurs complète avec try-catch
- Logs détaillés pour monitoring
- Tests avec 5 utilisateurs ayant tokens FCM actifs"

# Pousser vers GitHub (auto-deploy sur Render)
git push origin main
```

### 2. Vérifier le Déploiement sur Render

1. **Accéder à Render Dashboard**
   - URL: https://dashboard.render.com
   - Service: `validele` (https://validele.onrender.com)

2. **Suivre les Logs de Déploiement**
   - Aller dans l'onglet "Logs"
   - Attendre le message: `==> Build successful 🎉`
   - Puis: `==> Deploying...`
   - Enfin: `==> Your service is live 🎉`

3. **Temps de Déploiement Estimé**
   - Build: ~1-2 minutes
   - Deploy: ~30 secondes
   - **Total: ~2-3 minutes**

### 3. Tests Post-Déploiement

#### Test 1: Vérifier que le serveur démarre correctement

```bash
curl https://validele.onrender.com/health

# Réponse attendue:
# { "status": "ok", "timestamp": "2025-01-02T..." }
```

#### Test 2: Créer une commande de test

```bash
# Récupérer un token d'authentification valide (remplacer $TOKEN)
curl -X POST https://validele.onrender.com/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "buyer_id": "33d93...",
    "product_id": "...",
    "vendor_id": "e27e6...",
    "total_amount": 5000,
    "payment_method": "pixpay",
    "buyer_phone": "+221778676477",
    "delivery_address": "Dakar, Sénégal"
  }'
```

#### Test 3: Vérifier les notifications dans les logs

```bash
# Depuis Render Dashboard > Logs, rechercher:
[CREATE-ORDER-SIMPLE] Notification vendeur envoyée
[CREATE-ORDER-SIMPLE] Notification acheteur envoyée
```

#### Test 4: Test notification direct (Admin)

```bash
curl -X POST https://validele.onrender.com/api/admin/test-push \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "userId": "33d93f4e-9844-4f88-ae23-d33ad0a7caf6",
    "title": "🎉 Notifications Contextuelles Actives!",
    "body": "Le système de notifications est maintenant opérationnel sur Validèle!"
  }'

# Réponse attendue:
# {
#   "success": true,
#   "message": "Notification envoyée avec succès",
#   "messageId": "projects/validel-d7c83/messages/..."
# }
```

### 4. Tests de Scénario Complet

#### Scénario: Cycle de Vie d'une Commande

1. **Acheteur crée une commande** → Notifications:
   - ✅ Acheteur: "Votre commande CAB1234 a été créée avec succès!"
   - ✅ Vendeur: "Nouvelle commande CAB1234 reçue!"

2. **Acheteur paie** → Notifications:
   - ✅ Acheteur: "Votre paiement de 5000 FCFA a été confirmé!"
   - ✅ Vendeur: "Paiement reçu pour la commande CAB1234!"

3. **Livreur prend en charge** → Notification:
   - ✅ Acheteur: "Votre commande CAB1234 est en cours de livraison!" + SMS

4. **Livreur confirme livraison** → Notifications:
   - ✅ Acheteur: "Votre commande CAB1234 a été livrée!"
   - ✅ Vendeur: "Votre paiement pour la commande CAB1234 est en attente!"

5. **Admin déclenche payout** → Notification:
   - ✅ Vendeur: "Votre paiement de 5000 FCFA est en cours..."

6. **Payout effectué** → Notification:
   - ✅ Vendeur: "Vous avez reçu 5000 FCFA pour la commande CAB1234!"

**Total: 9 notifications** pour un cycle complet

### 5. Monitoring et Debugging

#### Logs à Surveiller

Dans Render Logs, rechercher:

```
✅ Succès:
[CREATE-ORDER-SIMPLE] Notification vendeur envoyée
[PIXPAY] Notification paiement confirmé envoyée à l'acheteur
[MARK-IN-DELIVERY] Notification push envoyée à l'acheteur
[MARK-DELIVERED] Notification acheteur envoyée
[ADMIN] Notification payout processing envoyée au vendeur
[PIXPAY] Notification payout payé envoyée au vendeur

❌ Erreurs à surveiller:
[CREATE-ORDER-SIMPLE] Erreur notification vendeur: ...
[PIXPAY] Erreur notifications paiement: ...
Firebase non configuré
Table push_tokens does not exist
```

#### Commandes de Debugging

```bash
# Vérifier la configuration Firebase
curl https://validele.onrender.com/api/admin/check-firebase \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Lister les tokens FCM actifs
# (Depuis Supabase Dashboard > Table Editor > push_tokens)
SELECT user_id, created_at, last_used_at 
FROM push_tokens 
WHERE is_active = true 
ORDER BY created_at DESC;

# Compter les notifications envoyées (via logs Render)
# Rechercher: "Notification.*envoyée"
```

### 6. Rollback en Cas de Problème

Si vous détectez un problème critique:

```bash
# Revenir au commit précédent
git log --oneline  # Noter le hash du commit avant les notifications
git revert <commit-hash>
git push origin main

# Render redéploiera automatiquement l'ancienne version
```

### 7. Variables d'Environnement à Vérifier

Sur Render Dashboard > Environment:

```
✅ FIREBASE_SERVICE_ACCOUNT_BASE64=<Base64 du JSON Firebase>
✅ SUPABASE_URL=https://...supabase.co
✅ SUPABASE_SERVICE_ROLE_KEY=eyJ...
✅ SUPABASE_ANON_KEY=eyJ...
✅ JWT_SECRET=...
✅ PIXPAY_API_KEY=...
```

## Métriques de Succès

Après déploiement, vous devriez observer:

- ✅ **0 erreurs** de démarrage du serveur
- ✅ **Build time**: ~2 minutes
- ✅ **Health check**: OK
- ✅ **Notifications envoyées**: > 0 dans les 24h
- ✅ **Taux de succès**: > 95%
- ✅ **Temps de réponse**: < 500ms par endpoint

## Support Post-Déploiement

### En cas d'erreur:

1. **Vérifier les logs Render**
   - https://dashboard.render.com > validele > Logs

2. **Tester manuellement les endpoints**
   - Utiliser Postman ou curl

3. **Vérifier Firebase**
   - Console Firebase: https://console.firebase.google.com
   - Projet: validel-d7c83
   - Aller dans Cloud Messaging > Send test message

4. **Vérifier Supabase**
   - Dashboard: https://supabase.com
   - Table push_tokens: Vérifier que les tokens existent

### Contacts Utiles

- **Render Support**: help@render.com
- **Firebase Support**: https://firebase.google.com/support
- **Supabase Support**: https://supabase.com/support

## Checklist Post-Déploiement

- [ ] Serveur démarré sans erreurs
- [ ] Health check répond OK
- [ ] Création de commande fonctionne
- [ ] Notifications vendeur envoyées
- [ ] Notifications acheteur envoyées
- [ ] Paiement déclenche notifications
- [ ] Livraison déclenche notifications
- [ ] Payout déclenche notifications
- [ ] Logs Render propres (pas d'erreurs critiques)
- [ ] Firebase credentials valides
- [ ] Aucun impact sur les performances

## 🎊 Félicitations!

Si tous les tests passent, le système de notifications contextuelles est **déployé et opérationnel** en production! 🚀

---

**Date**: 2025-01-02  
**Version**: 1.0  
**Statut**: Production Ready ✅
