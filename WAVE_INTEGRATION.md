# Intégration Wave via PayDunya

## Configuration

### Variables d'environnement

Créez un fichier `.env` dans le dossier `backend/` avec les clés PayDunya :

```env
PAYDUNYA_MASTER_KEY=DmGws1Xi-2iJl-JGN4-Vni9-JI1GOWsMjTVs
PAYDUNYA_PRIVATE_KEY=live_private_QriHfl3vzV095zgYTQ6FrijJRzb
PAYDUNYA_PUBLIC_KEY=your_public_key_here
PAYDUNYA_TOKEN=hUZRPNA93dz0WtBQWoik
PAYDUNYA_CALLBACK_URL=http://localhost:5000/api/payment/webhook
```

### Installation des dépendances

```bash
cd backend
npm install
```

## Fonctionnalités

### 1. Création de facture Wave
- **Endpoint**: `POST /api/wave/create-invoice`
- **Fonction**: Crée une facture PayDunya pour le paiement Wave
- **Paramètres**:
  - `amount`: Montant en FCFA
  - `description`: Description du produit
  - `customer`: Informations du client
  - `custom_data`: Données personnalisées (order_id)

### 2. Paiement Wave
- **Endpoint**: `POST /api/wave/make-payment`
- **Fonction**: Effectue le paiement via Wave
- **Paramètres**:
  - `wave_senegal_fullName`: Nom complet du client
  - `wave_senegal_email`: Email du client
  - `wave_senegal_phone`: Numéro de téléphone Wave
  - `wave_senegal_payment_token`: Token de la facture

### 3. Webhook de notification
- **Endpoint**: `POST /api/payment/webhook`
- **Fonction**: Traite les notifications de paiement de PayDunya
- **Actions**: Met à jour le statut de la commande dans Supabase

## Flux de paiement

1. **Recherche de produit** : L'utilisateur recherche un produit par code
2. **Sélection Wave** : L'utilisateur choisit Wave comme moyen de paiement
3. **Création de commande** : La commande est créée dans Supabase
4. **Création de facture** : Une facture PayDunya est créée
5. **Formulaire de paiement** : L'utilisateur remplit ses informations Wave
6. **Redirection Wave** : L'utilisateur est redirigé vers Wave pour finaliser le paiement
7. **Notification** : PayDunya notifie le webhook du statut du paiement
8. **Mise à jour** : Le statut de la commande est mis à jour dans Supabase

## Test de l'API

### Créer une facture
```bash
curl -H "Content-Type: application/json" \
     -H "PAYDUNYA-MASTER-KEY: DmGws1Xi-2iJl-JGN4-Vni9-JI1GOWsMjTVs" \
     -H "PAYDUNYA-PRIVATE-KEY: live_private_QriHfl3vzV095zgYTQ6FrijJRzb" \
     -H "PAYDUNYA-TOKEN: hUZRPNA93dz0WtBQWoik" \
     -X POST \
     -d '{"invoice": {"total_amount": 5000, "description": "Test produit"}, "store": {"name": "Escrow Pay"}}' \
     "https://app.paydunya.com/api/v1/checkout-invoice/create"
```

### Effectuer un paiement Wave
```bash
curl -H "Content-Type: application/json" \
     -H "PAYDUNYA-PRIVATE-KEY: live_private_QriHfl3vzV095zgYTQ6FrijJRzb" \
     -X POST \
     -d '{"wave_senegal_fullName": "John Doe", "wave_senegal_email": "test@gmail.com", "wave_senegal_phone": "777777777", "wave_senegal_payment_token": "TOKEN_FROM_STEP_1"}' \
     "https://app.paydunya.com/api/v1/softpay/wave-senegal"
```

## Interface utilisateur

### Composants mis à jour
- **BuyerDashboard**: Interface de paiement Wave avec formulaire
- **OrderDetails**: Affichage du moyen de paiement Wave
- **VendorDashboard**: Gestion des commandes Wave
- **HomePage**: Présentation de Wave comme moyen de paiement

### Fonctionnalités UI
- Sélecteur de moyen de paiement (Wave uniquement)
- Formulaire de paiement Wave avec validation
- Modal de paiement avec champs requis
- Redirection automatique vers Wave
- Gestion des états de chargement et d'erreur

## Sécurité

- Validation des données côté client et serveur
- Gestion sécurisée des tokens PayDunya
- Webhook sécurisé pour les notifications
- Validation des montants et des informations client

## Déploiement

1. Configurer les variables d'environnement
2. Démarrer le serveur backend : `npm start`
3. Démarrer le frontend : `npm run dev`
4. Tester l'intégration avec des montants faibles
5. Configurer le webhook en production 