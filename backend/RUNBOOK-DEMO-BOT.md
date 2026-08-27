# Runbook — Bot WhatsApp DÉMO (routage multi-numéro)

But : un **numéro démo** qui fait vivre le vrai parcours d'achat à un prospect,
**sans 2e service Render ni 2e webhook** — donc **sans coût ni infra en plus**.

> **Numéro démo :** `+1 555-467-7146` → format WhatsApp/D7 (sans `+`) = **`15554677146`**.
> **Numéro prod :** `+221 76 817 11 75` → `221768171175`. Les deux sont
> **Connected** sur D7.

---

## Le principe (nouvelle approche)

Le webhook D7 entrant contient le champ **`recipient`** = le numéro business qui a
**reçu** le message (confirmé sur la doc D7 « receive-whatsapp-postback »,
event `USER_INITIATED`). Le backend lit ce champ et **répond DEPUIS ce même
numéro**.

Conséquence : **un seul backend + un seul webhook** servent les deux numéros.
- Message vers le numéro **prod** → réponse depuis la **prod**.
- Message vers le numéro **démo** → réponse depuis le **démo**.
- Pas de `recipient` → repli sur `WHATSAPP_BOT_NUMBER` (comportement historique).

L'ancienne idée « 2e service Render + 2e webhook » n'est **plus nécessaire**
(elle coûtait un plan de plus et butait sur le webhook unique de D7).

---

## Ce qui a été fait côté code (déjà commité dans la branche)

| Fichier | Changement |
|---|---|
| `backend/direct7.js` | `resolveWhatsAppOriginator(from)` + param `from` optionnel sur `sendWhatsApp` / `sendWhatsAppButtons` / `sendWhatsAppCtaUrl` / `sendWhatsAppTemplate`. Repli sur `WHATSAPP_BOT_NUMBER` si `from` absent. |
| `backend/whatsapp-bot.js` | `parseD7Message` expose `to` (= `recipient`) ; `processWebhook` répond depuis `parsed.to`. |
| `backend/tests/whatsapp-bot.test.js` | 5 tests de routage (34/34 verts). |
| `functions/demo/[code].js` + `functions/product/demo/[code].js` | lien de marque `/demo/{code}` → numéro démo. |
| `backend/scripts/demo-bot-sim.js` | simulateur hors-ligne du parcours démo. |

**Rétrocompatible** : sans `recipient`, la prod se comporte exactement comme avant.

---

## Étape 1 — Vérifier le webhook D7 (le seul vrai réglage)

Il faut que les messages entrants du numéro **démo** arrivent au **même webhook**
que la prod.

1. Console D7 → configuration du webhook des messages entrants.
2. Confirmer qu'il est **au niveau du compte** (ou que le numéro `15554677146`
   pointe vers la **même URL** que `221768171175`) :
   ```
   https://<ton-backend-prod>.onrender.com/api/whatsapp/webhook/<WHATSAPP_WEBHOOK_SECRET>
   ```
3. **Ne rien changer** au numéro prod.

> Si D7 exige une URL de webhook **par numéro** et que tu ne peux pas mettre la
> même pour les deux, dis-le : on adaptera (mais l'objectif est bien : les deux
> numéros → le même backend).

---

## Étape 2 — Déployer le backend de prod (avec le nouveau code)

Aucune nouvelle variable d'environnement. Le déploiement pousse simplement le
code de routage. `WHATSAPP_BOT_NUMBER` reste = `221768171175` (numéro par défaut /
repli). Vérifie après déploiement que les tests passent :

```bash
cd backend && node tests/whatsapp-bot.test.js
```

### Étape 2 bis — Migration 008 (obligatoire, à faire AVANT le déploiement)

Répondre depuis le bon numéro ne suffit pas : `recipient` ne vit que le temps du
webhook. Sans le figer sur la commande, les notifications ultérieures (livraison,
remboursement, paiement confirmé) repartent du numéro **prod**, donc dans une
autre conversation que celle où le prospect a commandé.

Dans l'éditeur SQL Supabase, exécuter :

```text
backend/migrations/008_add_orders_bot_number.sql
```

Elle ajoute `orders.bot_number` (texte, NULL par défaut). Rétrocompatible :
`NULL` = commande web/app ou antérieure → repli sur `WHATSAPP_BOT_NUMBER`.

> Si le code part **avant** la migration, `/api/guest/order` détecte la colonne
> absente et recrée la commande sans elle (log `[GUEST] Colonne bot_number
> absente`) : la commande passe, seul le routage multi-numéro est perdu le temps
> d'appliquer la 008.

### Étape 2 ter — Migration 009 + catalogue de démonstration

Même éditeur SQL Supabase :

```text
backend/migrations/009_add_demo_flags.sql
```

Elle ajoute `is_demo` sur `profiles`, `products` et `orders` (`false` partout par
défaut → aucune donnée existante ne change de nature).

Puis créer le vendeur et le produit de démonstration :

```bash
node backend/scripts/seed-demo-catalog.js
```

Le script est **idempotent** (relançable) et affiche les identifiants du vendeur
démo. Il refuse d'écrire si la 009 n'est pas passée, et refuse d'écraser un
produit réel qui occuperait déjà le code démo.

| Variable d'env (toutes optionnelles) | Défaut | Rôle |
|---|---|---|
| `WHATSAPP_DEMO_BOT_NUMBERS` | `15554677146` | Numéros de bot traités comme démo (séparés par des virgules ; vide = plus aucun) |
| `DEMO_PRODUCT_CODE` | `PD0000` | Code du produit de démonstration |
| `DEMO_VENDOR_EMAIL` | `demo-vendeur@validel.shop` | Identifiant du vendeur démo |
| `DEMO_VENDOR_PASSWORD` | *(généré, affiché une fois)* | Fixe le mot de passe du vendeur démo |

---

## Étape 3 — Le premier test live

1. Depuis ton WhatsApp perso, écris **`PD0000`** au **`+1 555-467-7146`**.
2. Tu dois recevoir la **fiche produit** + boutons — envoyée **depuis le numéro
   démo**.
3. Logs Render : l'événement est traité, l'envoi part depuis `15554677146`.
4. Contrôle croisé : un message au numéro **prod** répond toujours depuis la prod
   — et `PD0000` y est **introuvable** (le catalogue démo est masqué en prod).

> ⚠️ N'utilise plus `PD3431` : ce code n'existe pas en base et le bot répond
> « Ne payez pas ce vendeur », ce qui ouvre la démo sur une alarme anti-fraude.

Pour rejouer le parcours hors-ligne (sans D7) à tout moment :
```bash
node backend/scripts/demo-bot-sim.js
```

---

## Étape 4 — Le lien de marque (optionnel)

`functions/demo/[code].js` est prêt : après **déploiement Cloudflare Pages**,
`validel.shop/demo/PD0000` redirige vers le numéro démo. En face-à-face tu n'en as
pas besoin : `https://wa.me/15554677146?text=Demarrer%20PD0000` suffit.

---

## Ce qui est isolé, et ce qui ne l'est pas encore

**Isolé** (marquage `is_demo`, migration 009) :

- Le **catalogue démo** n'est visible que depuis un numéro de bot démo. Depuis la
  prod, `PD0000` répond « code introuvable ».
- Toute commande née d'un numéro démo (ou portant sur un produit démo) est marquée
  `orders.is_demo = true`.
- Ces commandes **ne peuvent pas déclencher de virement vendeur** : elles sont
  écartées à la constitution des lots ET dans `verifyOrderForPayout` (motif
  `demo_order`). C'est le verrou qui protège l'argent réel.
- Dans le back-office admin elles restent **visibles**, avec un badge « Démo » —
  volontaire : tu peux montrer le back-office pendant une démo.

**⚠️ Pas encore isolé : le paiement est toujours RÉEL.** Le bouton « Payer »
mène au vrai Wave / Orange Money. Tant que le **simulateur de paiement** n'est pas
en place, deux options :

- **Arrête-toi à l'écran de paiement** (« …et là, il paie en sécurité ») ;
- ou baisse le prix du produit démo (`DEMO_PRODUCT_PRICE=100`, puis relancer le
  seed) et paie pour de vrai afin de dérouler tout le cycle jusqu'à la
  **validation QR** — l'argent part réellement, mais aucun virement vendeur ne
  suivra.

---

## Récap express

| Étape | Où | Action |
|---|---|---|
| Code | backend + functions | ✅ fait (routage `recipient`, `bot_number`, `is_demo`, tests 59/59) |
| Webhook | Console D7 | ✅ les deux numéros → **même** webhook backend |
| Migrations | Supabase (SQL) | 008 puis 009, **avant** le déploiement |
| Catalogue démo | ligne de commande | `node backend/scripts/seed-demo-catalog.js` |
| Déploiement | Render (service prod existant) | pousser le code ; aucune nouvelle var obligatoire |
| Test | WhatsApp | écrire `PD0000` au `+1 555…` → réponse depuis le numéro démo |
| Prod | — | **inchangée** (repli par défaut si pas de `recipient`) |
| Reste à faire | backend | simulateur de paiement (`is_demo` → paiement fictif) |
