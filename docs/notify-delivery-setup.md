# Endpoint: notify-delivery-started

But: envoyer un SMS au client lorsque la commande passe en "en cours de livraison" et inclure le numéro du livreur.

## Fichiers ajoutés

- `src/backend/notify-delivery-started.example.ts` : handler prêt à déployer (Next.js API / Express compatible)
- `scripts/001-create-sms-logs.sql` : script SQL pour créer la table `sms_logs` (trace & debugging)

## Variables d'environnement requises

- `SUPABASE_URL` – URL Supabase
- `SUPABASE_SERVICE_KEY` – clé service role Supabase (privilèges serveur)
- `D7_API_KEY` – clé API Direct7 (ou fournisseur SMS)
- `D7_SMS_URL` (optionnel) – URL API SMS (défaut: <https://api.direct7networks.com/sms/send>)

## Déploiement

1. Appliquer la migration SQL (`scripts/001-create-sms-logs.sql`) sur votre base Postgres/Supabase.
2. Déployer le fichier `notify-delivery-started.example.ts` en tant qu'endpoint `POST /api/notify/delivery-started`.
3. Configurer les variables d'environnement listées ci-dessus sur votre plateforme (Render, Vercel, etc.).

## Utilisation côté frontend

Appeler l'endpoint avec le payload minimal :

```json
{
  "orderId": "<uuid>",
  "buyerId": "<uuid>",
  "orderCode": "<code>",
  "deliveryPersonPhone": "+221771234567" // optionnel
}
```

Le handler :

- trouve les numéros nécessaires si non fournis
- envoie le SMS via D7
- log l'envoi dans `sms_logs`

## Tests

- Testez d'abord avec un numéro de test ou en mode sandbox (Direct7 fournit des options de test).
- Vous pouvez effectuer un test **sans envoyer de SMS** en ajoutant l'en-tête HTTP `X-Dry-Run: 1` à la requête ; l'endpoint renverra le message qui aurait été envoyé et l'enregistrera dans `sms_logs` avec `status = 'sent'` mais sans appeler D7.
- Vérifiez `sms_logs` pour confirmer les enregistrements et statuts d'envoi.

## Améliorations possibles

- Retry + backoff pour les envois échoués
- Webhooks pour recevoir les statuts d'envoi si supporté par D7
- Limitation (rate-limiting) et permissions pour éviter abus
