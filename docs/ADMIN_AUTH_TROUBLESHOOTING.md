# Guide de Dépannage - Authentification Admin

## Problème : Erreur 403 "Forbidden: admin access required"

### Symptômes
- Vous recevez une erreur 403 lors de la connexion
- Message : "Forbidden: admin access required"
- Après rafraîchissement, vous voyez brièvement le dashboard puis retour au formulaire de connexion

### Cause
Votre compte utilisateur n'a pas les permissions administrateur dans la base de données.

### Solution

#### Étape 1 : Vérifier votre profil dans Supabase

1. Ouvrez **Supabase Dashboard** → votre projet
2. Allez dans **Table Editor** → table `profiles`
3. Trouvez votre profil (par email)
4. Vérifiez la colonne `role`

#### Étape 2 : Ajouter le rôle admin

**Option A : Via l'interface Supabase**
1. Cliquez sur votre ligne de profil
2. Modifiez la colonne `role` → mettez `admin`
3. Sauvegardez

**Option B : Via SQL Editor**
```sql
-- Remplacez 'VOTRE_EMAIL' par votre email
UPDATE profiles 
SET role = 'admin'
WHERE email = 'votre.email@example.com';

-- Vérifier
SELECT id, email, full_name, role 
FROM profiles 
WHERE email = 'votre.email@example.com';
```

#### Étape 3 : Script automatique

Vous pouvez aussi exécuter le script de migration :
```bash
# Dans Supabase SQL Editor, exécutez :
supabase/migrations/add_admin_role.sql
```

**Important :** Modifiez d'abord l'email dans le fichier !

### Vérification

Après avoir ajouté le rôle :

1. **Déconnectez-vous** complètement
2. **Fermez** tous les onglets
3. **Reconnectez-vous** avec vos identifiants admin
4. Le dashboard devrait maintenant rester affiché

### Vérifications techniques

#### Vérifier les logs serveur
Les logs devraient montrer :
```
[ADMIN] requireAdmin: detected supabase user id -> b00848f9-de62-4616-b69a-382be83a7652
[ADMIN] requireAdmin: profile lookup for b00848f9-de62-4616-b69a-382be83a7652 -> role: admin
[ADMIN] requireAdmin: profile role=admin, granting access for b00848f9-de62-4616-b69a-382be83a7652
```

#### Vérifier le cookie
Dans les DevTools → Application → Cookies :
- Nom : `admin_access`
- Valeur : token JWT valide
- HttpOnly : ✓
- Secure : ✓ (en production)

#### Vérifier la réponse API
L'endpoint `/api/admin/validate` doit retourner :
```json
{
  "success": true,
  "user": { ... },
  "message": "Admin session valide"
}
```

## Autres problèmes courants

### "Missing Authorization token or admin cookie"
- Le cookie `admin_access` n'est pas envoyé
- Vérifiez les paramètres CORS
- Vérifiez que `credentials: 'include'` est bien dans les appels fetch

### "Invalid session"
- Le token JWT a expiré
- Reconnectez-vous

### Cookie non persistant après rafraîchissement
- Vérifiez que le cookie est `HttpOnly`
- Vérifiez la durée de vie du cookie (TTL)
- Vérifiez que le domaine du cookie correspond

## Configuration requise

### Variables d'environnement (optionnel)
```env
# Si vous voulez utiliser un admin ID spécifique
ADMIN_USER_ID=votre-uuid-admin

# Secret pour les tokens JWT admin
ADMIN_JWT_SECRET=votre-secret-securise
ADMIN_TOKEN_TTL=3600
```

### Permissions RLS Supabase
Assurez-vous que les politiques RLS permettent aux admins d'accéder aux données :

```sql
-- Exemple de politique pour admins
CREATE POLICY "Admins can view all"
  ON table_name
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );
```

## Support

Si le problème persiste :

1. **Vérifiez les logs backend** : Cherchez `[ADMIN]` dans la console serveur
2. **Vérifiez les logs frontend** : Console navigateur pour les erreurs de requête
3. **Vérifiez Supabase** : Table `profiles`, colonne `role`
4. **Testez l'endpoint** : 
   ```bash
   curl -X GET https://votre-app.com/api/admin/validate \
     -H "Cookie: admin_access=VOTRE_TOKEN" \
     -v
   ```

## Checklist de dépannage

- [ ] Rôle = 'admin' dans table `profiles` ?
- [ ] Cookie `admin_access` présent dans DevTools ?
- [ ] Logs backend montrent "profile role=admin" ?
- [ ] `/api/admin/validate` retourne `success: true` ?
- [ ] Déconnexion/reconnexion effectuée ?
- [ ] Cache navigateur vidé ?
- [ ] Variables d'environnement correctes ?
