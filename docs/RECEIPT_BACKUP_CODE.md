# Code de secours de réception

Le client vérifie le produit avant de présenter son QR ou de communiquer son code de secours à quatre chiffres. Les deux moyens confirment la réception du colis.

## Publication

Publier le backend Render avec `backend/server.js` et `backend/receipt-code.js` avant la version web. Aucune migration SQL n'est nécessaire. Le serveur utilise la clé de service Supabase déjà configurée pour dériver un code stable pour chaque commande. Une rotation de cette clé modifie les codes : le client doit alors actualiser sa page.

La version web inclut `ReceiptCode`, le suivi invité, le QR acheteur et la saisie dans le scanner client du vendeur/livreur.

Les notifications « livraison en cours » WhatsApp et SMS contiennent le même code de secours et la consigne de vérifier le produit avant de le communiquer. Le template WhatsApp conserve son unique variable approuvée, enrichie du code et de la consigne. Le SMS programmé est enregistré avec son texte complet ; les anciennes notifications de livraison sans code sont enrichies au moment du repli. Si les deux tentatives d'envoi WhatsApp échouent avant un identifiant fournisseur, le SMS est envoyé immédiatement.

## Vérification

- Le code n'est affiché que pour les commandes payées, affectées ou en livraison.
- Dans l'espace connecté, seul l'acheteur de la commande peut demander le code. Le suivi invité utilise le lien existant de suivi privé, qui donne déjà accès au QR de réception.
- La personne qui saisit le code doit être authentifiée et affectée à la livraison en cours.
- Après validation du code, une preuve signée valable cinq minutes permet de confirmer la réception. Une réponse serveur en erreur n'entraîne jamais de mise à jour directe côté navigateur pour ce parcours.
- Cinq codes incorrects bloquent la saisie pour quinze minutes. Le QR reste utilisable. Le compteur est en mémoire du processus serveur : un redémarrage le réinitialise, et plusieurs instances ne le partagent pas.

Tests : `node --test backend/tests/delivery-receipt-notifications.test.js backend/tests/receipt-code.test.js backend/tests/vendor-self-delivery.test.js` et `npx vitest run src/components/QRScanner.test.tsx`.
