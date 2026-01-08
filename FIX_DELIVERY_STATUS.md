# Comment appliquer la correction du statut de livraison

## Problème
Après le scan du QR code par le livreur, le statut de la commande ne passe pas de `paid` à `delivered`.

## Cause
La politique RLS (Row Level Security) de Supabase empêche les livreurs de mettre à jour le statut des commandes.

## Solution

### Étape 1 : Se connecter à Supabase
1. Aller sur [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Sélectionner votre projet **validel-d7c83** (ou votre projet Validele)
3. Cliquer sur **SQL Editor** dans le menu de gauche

### Étape 2 : Exécuter la migration SQL
1. Copier le contenu du fichier `supabase/migrations/20260108000001-fix-delivery-update-policy.sql`
2. Le coller dans l'éditeur SQL
3. Cliquer sur **Run** (ou appuyer sur Ctrl+Enter)

### Étape 3 : Vérifier que la politique est appliquée
1. Aller dans **Database** > **Policies** dans le menu de gauche
2. Sélectionner la table `orders`
3. Vérifier que la politique **"Delivery persons can update assigned orders"** existe
4. La politique devrait permettre aux livreurs de :
   - Prendre des commandes disponibles (`status = 'paid'` et `delivery_person_id IS NULL`)
   - Mettre à jour les commandes qui leur sont assignées (`delivery_person_id = auth.uid()`)

### Étape 4 : Tester
1. Ouvrir l'application mobile en tant que livreur
2. Accepter une commande (elle passe à `assigned`)
3. Démarrer la livraison (elle passe à `in_delivery`)
4. Scanner le QR code du client
5. Confirmer la livraison
6. **Vérifier dans le dashboard** que la commande apparaît bien dans "Livraisons terminées"
7. **Vérifier dans Supabase** que le `status` est bien `delivered`

## Code modifié
- `src/components/QRScanner.tsx` : Amélioration de la gestion d'erreur lors de la mise à jour du statut
- `supabase/migrations/20260108000001-fix-delivery-update-policy.sql` : Nouvelle politique RLS

## Logs à vérifier
Si le problème persiste, ouvrir la console du navigateur (F12) et chercher :
```
QRScanner: résultat update delivered
```

Si vous voyez une erreur comme :
```
ERREUR mise à jour statut delivered: new row violates row-level security policy
```

Cela signifie que la politique RLS n'a pas été appliquée correctement dans Supabase.

## Alternative : Désactiver temporairement RLS (NON RECOMMANDÉ)
Si vous voulez tester rapidement sans RLS (⚠️ **uniquement en développement**) :

```sql
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
```

⚠️ **NE PAS FAIRE EN PRODUCTION** - Cela expose toutes les commandes à tous les utilisateurs.

Pour réactiver RLS :
```sql
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
```
