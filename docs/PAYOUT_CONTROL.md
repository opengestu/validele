Payouts manuels et automatiques
==============================

Le mode initial est **manuel**. La première application de la migration de routage remet volontairement le système en manuel, avec le secours automatique désactivé, pour vérifier les deux prestataires avant réactivation. Une réexécution de cette migration conserve les réglages existants.

Avant déploiement
-----------------

1. Rapprocher les anciens virements encore en attente chez Pixpay. Les anciennes URL IPN sans secret ne sont pas acceptées par le nouveau parcours payout. Ne pas rouvrir un payout payé ou incertain pour « débloquer » une commande.
2. Sauvegarder la base et appliquer `supabase/migrations/20261023_controlled_payouts.sql` dans Supabase. La migration remplace le trigger de synchronisation trop large et ajoute les réglages, le journal des changements de mode et les tentatives de paiement. Elle ne réécrit aucun statut historique.
3. Configurer sur Render `PAYOUT_COMMISSION_PCT` (0 inclus si explicitement souhaité ; de 0 à moins de 100) et `PAYOUT_WEBHOOK_SECRET` (secret aléatoire long), ainsi que la clé Supabase service_role existante. Ne pas réutiliser `VALIDEL_COMMISSION_PCT` : cette variable reste dédiée aux frais acheteur. Le taux payout doit être confirmé par l'administrateur ; aucune valeur de production n'est modifiée automatiquement.
4. Pour une base déjà installée, appliquer uniquement `supabase/migrations/20261024_provider_routed_payouts.sql` après la réparation des dates si nécessaire. Pour une base neuve, appliquer d'abord les migrations initiales. Ne pas réappliquer l'ancienne migration initiale après celle de routage : elle contient les anciennes fonctions.
5. Configurer les clés de production `PAYDUNYA_MASTER_KEY`, `PAYDUNYA_PRIVATE_KEY`, `PAYDUNYA_TOKEN` et activer l'API PUSH / déboursement dans le compte PayDunya. `PAYDUNYA_MODE` doit être `prod` pour les payouts (aucune requête production avec une configuration sandbox). Le callback est `/api/payment/paydunya-payout-webhook`, protégé par le secret payout et le hash SHA-512 PayDunya. `PAYOUT_IPN_BASE_URL` est optionnel et prend par défaut le domaine backend Pixpay existant. Les deux comptes doivent avoir leur propre solde disponible.
6. Déployer backend et frontend après application SQL. Vérifier le mode manuel, les montants et les prestataires affichés dans « Derniers envois ». Vérifier les retours IPN avec les prestataires avant activation en production. Les tests locaux n'effectuent aucun virement réel et ne confirment pas les autorisations du compte PayDunya.
7. Activer l'automatique depuis l'admin lorsque souhaité. Le premier passage peut prendre les commandes déjà en attente. Activer séparément « Autoriser le secours » si le débit de l'autre prestataire après échec confirmé est souhaité. Les anciens flags `ENABLE_PAYOUT_SCHEDULER` et `PAYOUT_SCHEDULE_CRON` ne commandent plus les payouts.

Comportement
------------

Si le journal indique `column "payout_processing_at" of relation "orders" does not exist`, appliquer `supabase/migrations/20261024_fix_payout_order_timestamps.sql` dans la base Supabase déjà configurée. Ce correctif ajoute les dates manquantes sans changer les statuts ni le mode. La réservation en erreur est annulée par PostgreSQL avant tout appel Pixpay ; le lot reste disponible pour le prochain passage automatique. Ne pas réinitialiser les commandes ni recréer manuellement un virement pour corriger ce problème de schéma.

- Chaque minute, le backend lit le mode et crée des lots automatiques avec les commandes livrées, non démo, ayant un paiement confirmé et sans remboursement en attente/accepté/traité. Il utilise un client service_role indépendant des sessions de connexion.
- Le prestataire est déterminé par l'encaissement réellement confirmé dans `payment_transactions` (montant complet), jamais par le seul wallet Wave/Orange, le prestataire initialement tenté, ou la date de confirmation de la commande. Un fallback acheteur vers PayDunya donne donc un payout PayDunya. Pour un même vendeur dans un lot, les montants PayDunya et Pixpay sont séparés. Le taux et le net restent ceux enregistrés sur les éléments du lot.
- Un encaissement sans preuve de prestataire ou avec deux prestataires confirmés est bloqué (`payment_provider_unknown_or_ambiguous`). Les anciennes commandes PayDunya dont seul le statut de commande a été mis à jour nécessitent un rapprochement et la réception/relecture d'un IPN confirmé. Les callbacks PayDunya sont maintenant confirmés auprès de l'API avant d'inscrire une provenance utilisable.
- La base réserve chaque commande avant l'appel du prestataire. Les accès manuel, automatique et batch utilisent cette réservation. Le passage en manuel bloque les prochaines réservations automatiques, y compris le secours automatique ; un virement déjà réservé peut terminer son envoi.
- Le brut vendeur exclut les frais de protection acheteur enregistrés sur la commande. La commission est arrondie en FCFA, le net doit être strictement positif. Les lots existants et leurs relances conservent les montants enregistrés ; un ancien lot incohérent est bloqué et doit être vérifié.
- Les lots créés manuellement restent à traiter manuellement. Une tentative échouée n'est pas automatiquement renvoyée au même prestataire. Le secours automatique, s'il est explicitement activé et que le mode général est automatique, permet une seule tentative chez l'autre prestataire après échec final confirmé, ou refus avant toute soumission. En manuel, « Tenter le secours » réserve cette même tentative protégée. Pas de secours en cascade et pas de secours après une tentative plus récente sur les mêmes commandes.
- Un timeout, une réponse incomplète ou une erreur d'enregistrement après l'envoi conserve une tentative verrouillée. La rubrique « Derniers envois » permet de voir les états incertains. Un succès fournisseur authentifié clôture uniquement les éléments du virement concerné.
- Un timeout de soumission PayDunya est suivi d'une vérification du même token ; un rejet HTTP n'est jamais une preuve d'échec du virement. Le token est sauvegardé avant la soumission et revérifié chaque minute, même en mode manuel. Un statut `created` reste bloqué pour vérification du token non exécuté ; aucun second prestataire n'est déclenché pour ce statut. Les notifications PayDunya vérifient secret, hash, montant, token, tentative et statut distant. Pixpay conserve son suivi par IPN.
- Il n'existe plus d'API de finalisation forcée. Un cas incertain se rapproche chez son prestataire ; il ne faut jamais relancer à l'aveugle. Le suivi est conservé en base même après redémarrage. Le secours débite le solde de l'autre prestataire et ne transfère jamais le solde de l'encaisseur : `collection_provider`, `provider` et `fallback_of` conservent cette différence pour le rapprochement comptable.
- Le journal `payout_mode_events` conserve l'auteur et la date de chaque changement de mode. Les tables et fonctions du nouveau parcours sont réservées au service_role ; aucune écriture directe par le navigateur.

Vérification locale sans paiement
--------------------------------

```
npm --prefix backend ci --include=dev
npm --prefix backend run test:payout
npx vitest run src/components/PayoutControl.test.tsx
npm run build
```

Le moteur PostgreSQL des tests est éphémère et ne se connecte ni à Supabase ni à Pixpay. Les scripts historiques `admin-payout-flow.js` et `payout-batch-flow.js` appellent les vraies routes de paiement : ils ne doivent pas servir à la vérification locale ordinaire.

Références PayDunya : [débours et vérification de statut](https://developers.paydunya.com/doc/EN/api_deboursement), [confirmation serveur des encaissements](https://developers.paydunya.com/doc/EN/http_json). La soumission seule ne prouve pas que le bénéficiaire a reçu les fonds.
