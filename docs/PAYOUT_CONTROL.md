Payouts manuels et automatiques
==============================

Le mode initial est **manuel**. Aucun changement de mode, migration ou envoi réel n'est effectué par le déploiement du code seul.

Avant déploiement
-----------------

1. Rapprocher les anciens virements encore en attente chez Pixpay. Les anciennes URL IPN sans secret ne sont pas acceptées par le nouveau parcours payout. Ne pas rouvrir un payout payé ou incertain pour « débloquer » une commande.
2. Sauvegarder la base et appliquer `supabase/migrations/20261023_controlled_payouts.sql` dans Supabase. La migration remplace le trigger de synchronisation trop large et ajoute les réglages, le journal des changements de mode et les tentatives de paiement. Elle ne réécrit aucun statut historique.
3. Configurer sur Render `PAYOUT_COMMISSION_PCT` (0 inclus si explicitement souhaité ; de 0 à moins de 100) et `PAYOUT_WEBHOOK_SECRET` (secret aléatoire long), ainsi que la clé Supabase service_role existante. Ne pas réutiliser `VALIDEL_COMMISSION_PCT` : cette variable reste dédiée aux frais acheteur. Le taux payout doit être confirmé par l'administrateur ; aucune valeur de production n'est modifiée automatiquement.
4. Déployer backend et frontend. Vérifier le mode manuel, les montants et le suivi des envois. Tester le retour IPN authentifié avec Pixpay dans un environnement de test avant activation en production.
5. Activer l'automatique depuis l'admin lorsque souhaité. Le premier passage peut prendre les commandes déjà en attente. Les anciens flags `ENABLE_PAYOUT_SCHEDULER` et `PAYOUT_SCHEDULE_CRON` ne commandent plus les payouts.

Comportement
------------

Si le journal indique `column "payout_processing_at" of relation "orders" does not exist`, appliquer `supabase/migrations/20261024_fix_payout_order_timestamps.sql` dans la base Supabase déjà configurée. Ce correctif ajoute les dates manquantes sans changer les statuts ni le mode. La réservation en erreur est annulée par PostgreSQL avant tout appel Pixpay ; le lot reste disponible pour le prochain passage automatique. Ne pas réinitialiser les commandes ni recréer manuellement un virement pour corriger ce problème de schéma.

- Chaque minute, le backend lit le mode et crée des lots automatiques avec les commandes livrées, non démo, ayant un paiement confirmé et sans remboursement en attente/accepté/traité. Il utilise un client service_role indépendant des sessions de connexion.
- La base réserve chaque commande avant l'appel Pixpay. Les accès manuel, automatique et batch utilisent cette réservation. Le passage en manuel bloque les prochaines réservations automatiques ; un virement déjà réservé peut terminer son envoi.
- Le brut vendeur exclut les frais de protection acheteur enregistrés sur la commande. La commission est arrondie en FCFA, le net doit être strictement positif. Les lots existants et leurs relances conservent les montants enregistrés ; un ancien lot incohérent est bloqué et doit être vérifié.
- Les lots créés manuellement restent à traiter manuellement. En automatique, un refus confirmé n'est pas relancé automatiquement. Une relance manuelle conserve le taux du lot.
- Un timeout, une réponse incomplète ou une erreur d'enregistrement après l'envoi conserve une tentative verrouillée. La rubrique « Derniers envois » permet de voir les états incertains. Un succès fournisseur authentifié clôture uniquement les éléments du virement concerné.
- Il n'existe plus d'API de finalisation forcée. Un cas incertain se rapproche chez Pixpay ; il ne faut jamais relancer à l'aveugle. Le suivi est conservé en base même après redémarrage.
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
