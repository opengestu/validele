# Publication Android avec R8

La variante `release` active la minification, l'optimisation du code et la
suppression des ressources inutilisées. AGP 8.13 utilise également
`android.r8.optimizedResourceShrinking=true`.

Les règles de conservation de Capacitor sont fournies par sa bibliothèque
(`consumerProguardFiles`). Elles couvrent les plugins personnalisés qui étendent
`com.getcapacitor.Plugin`. Ne pas ajouter une règle globale conservant tout le code.

## Construction

Depuis `android` :

```powershell
.\gradlew.bat :app:bundleRelease --console=plain
```

Cette commande compile les ressources web déjà présentes dans le projet Android.
Pour inclure également de nouveaux changements web, exécuter auparavant
`npm run cap:sync:android` depuis la racine.

Fichiers produits :

- `android/app/build/outputs/bundle/release/app-release.aab`
- `android/app/build/outputs/mapping/release/mapping.txt`
- `android/app/build/outputs/mapping/release/configuration.txt`

Archiver le bundle et son mapping ensemble pour chaque version. Vérifier dans
Play Console la présence du fichier de désobscurcissement du bundle déposé.

## Validation avant production

Déposer le bundle sur une piste de test interne, puis tester cette version
optimisée sur un téléphone : démarrage, connexion, navigation, partage WhatsApp,
notifications, ouverture et retour du parcours de paiement, mises à jour Play.
Ne pas déclencher un paiement réel uniquement pour tester la compilation.

Vérifier les trois indicateurs d'optimisation dans l'explorateur de bundles de
Play Console. Une baisse locale de taille DEX ne constitue pas la mesure des
trois pourcentages Google Play.

Le `versionCode` doit être inédit sur Play Console. Si `120` a déjà été utilisé,
le prochain bundle destiné au dépôt doit utiliser une valeur supérieure.

Référence : https://developer.android.com/topic/performance/app-optimization/enable-app-optimization
