# 🔍 Diagnostic Rapide - Système de Remboursement

## ⚡ Diagnostic en 3 Minutes

### Étape 1: Vérifier l'État Actuel (30 secondes)

**Dans Supabase, table `refund_requests`:**

```sql
SELECT id, status, reviewed_at, processed_at, transaction_id 
FROM refund_requests 
WHERE id = 'VOTRE_REFUND_ID'
ORDER BY requested_at DESC 
LIMIT 5;
```

**Résultat attendu après approbation:**

- ✅ `status` = 'processed'
- ✅ `reviewed_at` != null
- ✅ `processed_at` != null
- ✅ `transaction_id` != null

**Si `status` = 'pending':**
→ La mise à jour backend a échoué, voir Étape 2

---

### Étape 2: Vérifier les Logs Backend (1 minute)

**Aller sur Render → Logs** et chercher:

#### ✅ Logs de Succès (ce qu'on veut voir)
<!-- 
```
[REFUND] Mise à jour demande: xxx status: processed
[REFUND] ✅ Demande mise à jour avec succès: xxx
[REFUND] Données mises à jour: { status: 'processed', ... }
``` -->

#### ❌ Logs d'Erreur (problèmes)
<!-- 
```
[REFUND] ❌ Erreur mise à jour demande: { code: 'PGRST301', message: '...' }
``` -->

**Code PGRST301** = Politique RLS bloque l'accès
→ Vérifier que `SUPABASE_SERVICE_ROLE_KEY` est bien configurée

---

### Étape 3: Test de la Clé Service Role (30 secondes)

**Dans le terminal Render ou localement:**

```bash
echo $SUPABASE_SERVICE_ROLE_KEY
```

**Doit retourner:** Une clé commençant par `eyJhbGc...` (très longue)

**Si vide ou incorrecte:**

1. Aller dans Render → Environment
2. Ajouter/Corriger `SUPABASE_SERVICE_ROLE_KEY`
3. Valeur: Récupérer depuis Supabase → Settings → API → service_role key (secret)
4. Redéployer l'application

---

### Étape 4: Vérifier les Politiques RLS (1 minute)

**Dans Supabase → Table Editor → refund_requests → Policies:**

**Doit avoir une politique BYPASS pour service role:**

- Policy name: "Service role has full access"
- Definition: `(auth.uid() = auth.uid())`
- Ou mieux: Désactiver RLS pour service_role dans Settings

**Si pas de politique:**

```sql
-- Créer une politique de bypass pour service role
CREATE POLICY "Service role bypass" ON refund_requests
FOR ALL USING (true) WITH CHECK (true);
```

⚠️ **Note:** Le service role devrait bypasser RLS automatiquement, mais certaines configurations Supabase nécessitent des politiques explicites.

---

## 🎯 Diagnostic par Symptôme

### Symptôme A: "Remboursement approuvé mais reste pending"

**Cause probable:** Mise à jour échoue silencieusement

**Diagnostic:**

1. ✅ L'argent a été envoyé au client? → Oui
2. ❌ Le status a changé dans Supabase? → Non
3. 🔍 Chercher dans logs: `[REFUND] ❌ Erreur mise à jour demande`

**Solution:**

- Vérifier `SUPABASE_SERVICE_ROLE_KEY` dans Render
- Vérifier les politiques RLS
- Voir logs pour le code d'erreur exact

---

### Symptôme B: "Historique ne s'affiche pas"

**Cause probable:** Frontend filtre mal ou données pas rechargées

**Diagnostic:**

1. Dans Supabase, le status est-il 'processed' ou 'approved'?
   - ✅ Oui → Problème frontend
   - ❌ Non → Voir Symptôme A

2. Attendre 1-2 secondes après approbation
3. Rafraîchir la page (F5)

**Solution:**

- Si toujours pas visible: Ouvrir DevTools Console
- Chercher erreurs dans fetch `/api/admin/refund-requests`
- Vérifier que le filtre est: `r.status !== 'pending'`

---

### Symptôme C: "Erreur 401 Unauthorized"

**Cause:** Session admin expirée ou token invalide

**Solution:**

1. Se déconnecter de l'AdminDashboard
2. Se reconnecter avec les credentials admin
3. Réessayer l'approbation

---

### Symptôme D: "L'argent n'est pas envoyé"

**Cause:** Erreur PixPay

**Diagnostic dans logs:**
<!-- 
```
[REFUND] Résultat PixPay: { success: false, message: '...' }
``` -->

**Solutions courantes:**

- Vérifier solde du compte PixPay marchand
- Vérifier que le numéro de téléphone est valide
- Vérifier que le wallet_type correspond (wave/orange)

---

## 🛠️ Commandes de Diagnostic Utiles

### Vérifier les derniers remboursements

```sql
SELECT 
  id, 
  status, 
  amount, 
  requested_at,
  reviewed_at,
  processed_at,
  transaction_id
FROM refund_requests
ORDER BY requested_at DESC
LIMIT 10;
```

### Vérifier une commande spécifique

```sql
SELECT 
  o.id,
  o.order_code,
  o.status as order_status,
  r.status as refund_status,
  r.amount,
  r.transaction_id
FROM orders o
LEFT JOIN refund_requests r ON r.order_id = o.id
WHERE o.id = 'VOTRE_ORDER_ID';
```

### Compter les remboursements par statut

```sql
SELECT status, COUNT(*) as count
FROM refund_requests
GROUP BY status;
```

---

## 🚨 Erreurs Critiques et Solutions

### Erreur: "PGRST301 - permission denied for table refund_requests"

**Cause:** Service role key invalide ou RLS trop restrictif
**Solution:**

1. Vérifier `SUPABASE_SERVICE_ROLE_KEY` dans Render
2. Copier la clé depuis Supabase → Settings → API
3. Redéployer

### Erreur: "Cannot read property 'phone' of null"

**Cause:** Profil buyer non trouvé
**Solution:** Vérifier que `buyer_id` dans refund_requests correspond à un profil existant

### Erreur: "PixPay service unavailable"

**Cause:** API PixPay inaccessible
**Solution:** Vérifier connectivité réseau ou contacter PixPay

---

## ✅ Checklist Pré-Déploiement

Avant de déployer en production, vérifier:

- [ ] `SUPABASE_SERVICE_ROLE_KEY` configurée dans Render
- [ ] Logs backend activés (console.log présents)
- [ ] Politiques RLS testées avec service role
- [ ] Test complet: créer → payer → annuler → approuver
- [ ] Vérifier l'historique s'affiche après approbation
- [ ] Tester aussi le rejet de remboursement

---

## 📞 Support

Si le problème persiste après ces vérifications:

1. **Capturer les logs complets** de Render lors d'une approbation
2. **Exporter les données** de la demande problématique depuis Supabase
3. **Noter l'heure exacte** de l'approbation
4. **Partager ces 3 éléments** pour diagnostic approfondi

---

**Dernière mise à jour:** 3 février 2026
**Version:** 1.0
