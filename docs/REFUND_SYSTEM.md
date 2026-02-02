# Système de Gestion des Remboursements

## Vue d'ensemble

Le système de remboursement a été amélioré pour inclure un processus d'approbation par l'administrateur. Les clients peuvent soumettre des demandes de remboursement, mais celles-ci doivent être approuvées par un admin avant d'être traitées.

## Architecture

### Base de données

**Table: `refund_requests`**

- `id`: UUID (clé primaire)
- `order_id`: UUID (référence à orders)
- `buyer_id`: UUID (référence à profiles)
- `amount`: DECIMAL(10, 2)
- `reason`: TEXT (raison de l'annulation)
- `status`: TEXT ('pending', 'approved', 'rejected', 'processed')
- `requested_at`: TIMESTAMP (date de la demande)
- `reviewed_at`: TIMESTAMP (date d'examen par l'admin)
- `reviewed_by`: UUID (admin qui a traité la demande)
- `processed_at`: TIMESTAMP (date du remboursement effectif)
- `transaction_id`: TEXT (ID de transaction PixPay)
- `rejection_reason`: TEXT (raison du rejet si applicable)

### Flux de travail

```
1. CLIENT SOUMET UNE DEMANDE
   ↓
2. DEMANDE CRÉÉE AVEC STATUS 'pending'
   ↓
3. ADMIN EXAMINE LA DEMANDE
   ↓
   ├─→ APPROUVÉE → Remboursement traité via PixPay → Status: 'processed'
   └─→ REJETÉE → Status: 'rejected' (avec raison)
```

## Endpoints API

### Client (Acheteur)

#### Soumettre une demande de remboursement

```http
POST /api/payment/pixpay/refund
Content-Type: application/json

{
  "orderId": "uuid",
  "reason": "Produit non conforme" // optionnel
}
```

**Réponse:**

```json
{
  "success": true,
  "refund_request_id": "uuid",
  "message": "Demande de remboursement soumise. Elle sera examinée par un administrateur."
}
```

**Conditions:**

- La commande doit avoir le statut `paid` ou `in_delivery`
- Aucune demande en attente ne doit exister pour cette commande

### Admin

#### Récupérer toutes les demandes

```http
GET /api/admin/refund-requests
Authorization: Bearer <admin_token>
```

**Réponse:**

```json
{
  "success": true,
  "refunds": [
    {
      "id": "uuid",
      "order_id": "uuid",
      "buyer_id": "uuid",
      "amount": 5000,
      "reason": "Produit non conforme",
      "status": "pending",
      "requested_at": "2026-02-02T10:00:00Z",
      "order": {
        "id": "uuid",
        "order_code": "ORD-123456",
        "products": { "name": "Produit exemple" }
      },
      "buyer": {
        "id": "uuid",
        "full_name": "Jean Dupont",
        "phone": "+221771234567"
      }
    }
  ]
}
```

#### Approuver une demande

```http
POST /api/admin/refund-requests/:id/approve
Authorization: Bearer <admin_token>
```

**Réponse:**

```json
{
  "success": true,
  "transaction_id": "pixpay_tx_id",
  "message": "Remboursement de 5000 FCFA initié vers +221771234567"
}
```

**Actions effectuées:**

1. Vérification de la demande (doit être 'pending')
2. Traitement du remboursement via PixPay
3. Mise à jour du statut de la demande → 'processed'
4. Mise à jour du statut de la commande → 'cancelled'
5. Enregistrement de la transaction de remboursement

#### Rejeter une demande

```http
POST /api/admin/refund-requests/:id/reject
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "reason": "Délai de retour dépassé"
}
```

**Réponse:**

```json
{
  "success": true,
  "message": "Demande de remboursement rejetée"
}
```

## Interface Utilisateur

### Client (BuyerDashboard)

- Bouton "Annuler / Remboursement" visible uniquement pour les commandes avec statut `paid` ou `in_delivery`
- Modal de confirmation avec:
  - Résumé de la commande
  - Information sur le processus d'approbation
  - Sélecteur de raison (optionnel)
  - Confirmation de soumission

### Admin (AdminDashboard)

**Onglet "🔄 Remboursements"** avec deux sections:

1. **Demandes en attente**
   - Liste des demandes avec status 'pending'
   - Informations: ID, commande, produit, acheteur, montant, raison, date
   - Actions: Bouton "✓ Approuver" et "✗ Rejeter"

2. **Historique des remboursements**
   - Liste des demandes traitées ('approved', 'rejected', 'processed')
   - Affichage du statut avec badge coloré
   - Date et admin ayant traité la demande
   - Raison du rejet si applicable

## Sécurité

### Row Level Security (RLS)

```sql
-- Les clients peuvent voir leurs propres demandes
"Users can view their own refund requests"
  ON refund_requests FOR SELECT
  USING (auth.uid() = buyer_id)

-- Les clients peuvent créer leurs demandes
"Users can create refund requests"
  ON refund_requests FOR INSERT
  WITH CHECK (auth.uid() = buyer_id)

-- Seuls les admins peuvent mettre à jour
"Only admins can update refund requests"
  ON refund_requests FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))

-- Les admins peuvent tout voir
"Admins can view all refund requests"
  ON refund_requests FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
```

## Migration de la base de données

Pour créer la table `refund_requests`, exécutez le script SQL:

```bash
# Dans la console SQL Supabase, exécutez:
supabase/migrations/create_refund_requests_table.sql
```

Ou directement dans le SQL Editor de Supabase.

## Tests

### Scénarios de test

1. **Client soumet une demande**
   - ✅ Demande créée avec status 'pending'
   - ✅ Notification de soumission affichée

2. **Admin approuve la demande**
   - ✅ Remboursement PixPay initié
   - ✅ Statut commande → 'cancelled'
   - ✅ Statut demande → 'processed'
   - ✅ Transaction enregistrée

3. **Admin rejette la demande**
   - ✅ Statut demande → 'rejected'
   - ✅ Raison du rejet enregistrée
   - ✅ Commande reste inchangée

4. **Tentative de double demande**
   - ✅ Erreur: "Une demande existe déjà"

## Avantages du système

1. **Contrôle administratif**: L'admin valide chaque remboursement
2. **Traçabilité complète**: Historique de toutes les demandes
3. **Flexibilité**: Possibilité de rejeter avec raison
4. **Sécurité**: RLS garantit l'accès approprié
5. **Transparence**: Les clients sont informés du processus

## Support

Pour toute question ou problème:

- Vérifier les logs avec `[REFUND]` dans la console
- Consulter la table `refund_requests` dans Supabase
- Vérifier les transactions dans `payment_transactions`
