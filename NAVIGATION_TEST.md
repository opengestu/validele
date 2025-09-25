# 🧪 Guide de test - Navigation après inscription

## Test de la correction de navigation

La correction apportée résout le problème où tous les utilisateurs étaient redirigés vers l'interface acheteur après inscription, nécessitant un rafraîchissement pour accéder au bon tableau de bord.

## Tests à effectuer

### 1. Test d'inscription Vendeur

1. Aller sur `https://localhost:5174/auth`
2. Cliquer sur "S'inscrire"
3. Remplir le formulaire avec :
   - Email : <test-vendor@example.com>
   - Mot de passe : Test123456
   - Nom complet : Test Vendeur
   - **Rôle : Vendeur**
   - Nom de l'entreprise : Ma Boutique
4. Cliquer sur "S'inscrire"
5. ✅ **Résultat attendu** : Redirection directe vers `/vendor` (tableau de bord vendeur)

### 2. Test d'inscription Livreur

1. Utiliser un nouvel email : <test-delivery@example.com>
2. **Rôle : Livreur**
3. Informations véhicule : Moto Honda
4. ✅ **Résultat attendu** : Redirection directe vers `/delivery` (tableau de bord livreur)

### 3. Test d'inscription Acheteur

1. Utiliser un nouvel email : <test-buyer@example.com>
2. **Rôle : Acheteur**
3. ✅ **Résultat attendu** : Redirection directe vers `/buyer` (tableau de bord acheteur)

### 4. Test de connexion

1. Se déconnecter
2. Se reconnecter avec chaque compte créé
3. ✅ **Résultat attendu** : Redirection directe vers le bon tableau de bord selon le rôle

### 5. Test de protection des routes

1. Essayer d'accéder à `/vendor` avec un compte acheteur
2. ✅ **Résultat attendu** : Redirection automatique vers `/buyer`

## Indicateurs de succès

- ❌ **Avant** : Tous les utilisateurs allaient vers `/buyer` après inscription
- ✅ **Après** : Chaque utilisateur va directement vers son tableau de bord approprié
- ✅ **Plus besoin** de rafraîchir la page après inscription
- ✅ **Navigation fluide** selon le type d'utilisateur

## Logs de débogage

Dans la console du navigateur, vous devriez voir :

```
Début inscription...
Compte créé avec succès
Profil mis à jour avec le rôle: vendor
```

## En cas de problème

Si la redirection ne fonctionne pas :

1. Vérifier la console pour les erreurs
2. Vérifier que Supabase est correctement configuré
3. S'assurer que la table `profiles` existe avec les bonnes colonnes

## Structure des rôles

- **buyer** → `/buyer` (Tableau de bord acheteur)
- **vendor** → `/vendor` (Tableau de bord vendeur)
- **delivery** → `/delivery` (Tableau de bord livreur)
