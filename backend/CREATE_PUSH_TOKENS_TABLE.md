# 🗄️ CRÉATION TABLE PUSH_TOKENS - GUIDE RAPIDE

**Problème détecté**: 
```sql
ERROR: relation "push_tokens" does not exist
```

**Solution**: Créer la table `push_tokens` dans Supabase

---

## ⚡ SOLUTION RAPIDE (2 MINUTES)

### Étape 1: Accéder au SQL Editor Supabase

1. Aller sur https://app.supabase.com/project/fmhhdoqwslckisiofovx
2. Cliquer sur **SQL Editor** dans le menu gauche
3. Cliquer sur **New Query**

### Étape 2: Exécuter le script de création

Copier-coller le contenu du fichier:
```
backend/scripts/create_push_tokens_table.sql
```

Puis cliquer sur **Run** (ou Ctrl+Enter)

✅ Vous devriez voir: `Table push_tokens créée avec succès!`

### Étape 3: Migrer les tokens existants

Vous avez déjà des tokens dans `profiles.push_token` (ex: Galo Bâ).

Exécuter le script:
```
backend/scripts/migrate_push_tokens.sql
```

✅ Cela copiera automatiquement tous les tokens existants vers la nouvelle table.

---

## 📊 VÉRIFICATION

Après création, vérifier:

```sql
-- Voir les tokens migrés
SELECT 
  pt.id,
  p.full_name,
  p.phone,
  pt.platform,
  LEFT(pt.token, 50) || '...' as token_preview
FROM push_tokens pt
JOIN profiles p ON p.id = pt.user_id
LIMIT 10;
```

Devrait afficher "Galo Bâ" avec son token Android.

---

## 🧪 TESTER LES NOTIFICATIONS

Une fois la table créée et les tokens migrés, tester:

```powershell
# Tester avec l'ID de Galo Bâ (qui a déjà un token)
Invoke-RestMethod -Uri "https://validele.onrender.com/api/admin/test-push" `
  -Method Post `
  -ContentType "application/json" `
  -Body (ConvertTo-Json @{ 
    userId='0bff4969-1966-4b5c-9401-08a7dbf51355'  # Galo Bâ
    title='Test Notification'
    body='Vous devriez recevoir cette notification!'
  })
```

**Résultat attendu**:
```javascript
{
  sent: true,
  hasToken: true,  // ✅ Plus de "hasToken: false"
  result: {
    name: 'projects/validel-d7c83/messages/...'
  }
}
```

Et **Galo Bâ devrait recevoir la notification sur son appareil** 📱

---

## 🔄 ALTERNATIVE: Utiliser directement profiles.push_token

Si vous préférez **ne pas créer** de table séparée, vous pouvez modifier le backend pour utiliser `profiles.push_token`:

**Fichier**: `backend/server.js` (rechercher les requêtes à `push_tokens`)

Remplacer:
```javascript
const { data: tokens } = await supabase
  .from('push_tokens')
  .select('token')
  .eq('user_id', userId);
```

Par:
```javascript
const { data: profile } = await supabase
  .from('profiles')
  .select('push_token')
  .eq('id', userId)
  .single();

const tokens = profile?.push_token ? [{ token: profile.push_token }] : [];
```

⚠️ **Mais je recommande de créer la table `push_tokens`** car:
- ✅ Meilleure organisation (séparation des concerns)
- ✅ Support multi-device (1 utilisateur = plusieurs appareils)
- ✅ Gestion par plateforme (iOS/Android/Web)

---

## 📋 CHECKLIST

- [ ] Table `push_tokens` créée dans Supabase
- [ ] Policies RLS configurées
- [ ] Index créés pour performances
- [ ] Tokens migrés depuis `profiles.push_token`
- [ ] Vérification OK (SELECT retourne des données)
- [ ] Test notification envoyée à Galo Bâ
- [ ] Notification reçue sur l'appareil

---

## 🎯 PROCHAINES ÉTAPES

Une fois la table créée:

1. ✅ Les notifications push fonctionneront immédiatement pour Galo Bâ
2. ✅ Les nouveaux utilisateurs pourront enregistrer leurs tokens
3. 📱 Suivre `GUIDE_NOTIFICATIONS_PUSH.md` pour l'app mobile

---

**Temps estimé**: 2 minutes  
**Impact**: Débloque complètement les notifications push  
**Priorité**: 🔴 CRITIQUE

**Créé**: 1er Février 2026
