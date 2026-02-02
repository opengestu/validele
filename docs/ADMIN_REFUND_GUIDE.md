# Guide Admin - Gestion des Remboursements

## Accès à l'interface

1. Connectez-vous au Dashboard Admin
2. Cliquez sur l'onglet **🔄 Remboursements**

## Demandes en attente

### Informations affichées

- **ID**: Identifiant unique de la demande
- **Commande**: Code de la commande
- **Produit**: Nom du produit commandé
- **Acheteur**: Nom et téléphone du client
- **Montant**: Montant à rembourser
- **Raison**: Motif de la demande
- **Date demande**: Quand la demande a été soumise

### Actions disponibles

#### ✓ Approuver

1. Cliquez sur le bouton **"✓ Approuver"**
2. Confirmez l'action dans la popup
3. Le système:
   - Traite le remboursement via PixPay
   - Annule la commande (statut → 'cancelled')
   - Enregistre la transaction
   - Notifie le client

#### ✗ Rejeter

1. Cliquez sur le bouton **"✗ Rejeter"**
2. Entrez la raison du rejet dans la popup
3. Le système:
   - Marque la demande comme rejetée
   - Enregistre votre raison
   - La commande reste inchangée

## Historique

Consultez toutes les demandes traitées avec:

- Statut (Approuvé ✓, Traité ✓, Rejeté ✗)
- Date de traitement
- Admin ayant traité la demande
- Raison du rejet (si applicable)

## Bonnes pratiques

### Avant d'approuver

- ✅ Vérifier la validité de la demande
- ✅ Confirmer le statut de la commande
- ✅ S'assurer que le montant est correct
- ✅ Vérifier les informations du client

### Raisons courantes d'approbation

- Produit défectueux
- Livraison non conforme
- Erreur de commande
- Délai de livraison excessif

### Raisons courantes de rejet

- Délai de retour dépassé
- Produit déjà utilisé/consommé
- Demande frauduleuse
- Commande déjà livrée et validée

## Notifications

Les clients reçoivent:

- Confirmation de soumission de la demande
- Notification d'approbation/rejet
- Confirmation du remboursement effectué

## Dépannage

### La demande n'apparaît pas

- Vérifier que le statut est 'pending'
- Rafraîchir la page
- Vérifier la connexion admin

### Erreur lors de l'approbation

- Vérifier que le compte PixPay a des fonds
- Vérifier le numéro de téléphone du client
- Consulter les logs serveur

### Transaction PixPay échouée

- Le statut reste 'approved' au lieu de 'processed'
- Retraiter manuellement si nécessaire
- Contacter le support PixPay

## Support technique

En cas de problème:

1. Vérifier les logs avec le filtre `[REFUND]`
2. Consulter la table `refund_requests` dans Supabase
3. Vérifier `payment_transactions` pour les remboursements
