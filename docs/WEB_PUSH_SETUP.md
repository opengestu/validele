# Notifications de commande sur le Web

1. Dans le projet Firebase utilisé par le backend, enregistrer une application Web.
2. Copier ses valeurs publiques dans les cinq variables `VITE_FIREBASE_*` de `.env.example`. La clé VAPID publique se trouve dans Paramètres du projet > Cloud Messaging > Certificats push Web. Ne jamais copier la clé privée du compte de service dans le frontend.
3. Vérifier que l'API FCM Registration est activée. Le backend doit avoir ses identifiants Firebase et `SUPABASE_SERVICE_ROLE_KEY` configurés.
4. Reconstruire et déployer le frontend et le backend. Le site doit être servi en HTTPS, avec `/firebase-messaging-sw.js` disponible comme JavaScript.
5. Se connecter, cliquer sur « Activer les notifications » et accepter la permission. Faire une commande avec un autre compte et vérifier les alertes, y compris après fermeture de l'onglet.

Sur iPhone/iPad, installer le site sur l'écran d'accueil et l'ouvrir depuis cette icône (iOS/iPadOS 16.4 ou ultérieur). Les visiteurs sans compte ne sont pas inscrits aux push.

Les jetons Web sont enregistrés dans `profiles.push_token`, comme ceux de l'application mobile, et les envois de commande existants sont réutilisés. Le profil ne conserve actuellement qu'un jeton : une activation sur un autre appareil remplace le précédent. Les routes anciennes qui utilisent uniquement `push_tokens` devront être harmonisées pour couvrir tous les événements.

Le worker push n'a aucun cache ni gestionnaire fetch. Le nettoyage de l'ancien worker PWA préserve uniquement la portée réservée aux notifications.

Documentation : https://firebase.google.com/docs/cloud-messaging/web/get-started
