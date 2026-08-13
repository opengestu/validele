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

---

## Étape 3 — Le premier test live

1. Depuis ton WhatsApp perso, écris **`PD3431`** (ou un vrai code produit) au
   **`+1 555-467-7146`**.
2. Tu dois recevoir la **fiche produit** + boutons — envoyée **depuis le numéro
   démo**.
3. Logs Render : l'événement est traité, l'envoi part depuis `15554677146`.
4. Contrôle croisé : un message au numéro **prod** répond toujours depuis la prod.

Pour rejouer le parcours hors-ligne (sans D7) à tout moment :
```bash
node backend/scripts/demo-bot-sim.js
```

---

## Étape 4 — Le lien de marque (optionnel)

`functions/demo/[code].js` est prêt : après **déploiement Cloudflare Pages**,
`validel.shop/demo/PD3431` redirige vers le numéro démo. En face-à-face tu n'en as
pas besoin : `https://wa.me/15554677146?text=Demarrer%20PD3431` suffit.

---

## ⚠️ Limite « démo complète » : le paiement est RÉEL

Le bouton **« Payer maintenant »** renvoie vers `/product/{code}` = la **vraie**
page de paiement Wave/Orange Money. Une démo qui va au bout traverse **du vrai
argent**. Deux options propres :

- **Arrête-toi à l'écran de paiement** (« …et là, il paie en sécurité »).
- Ou crée un **produit démo à petit prix** (ex. 100 FCFA) payé pour de vrai afin
  de dérouler tout le cycle jusqu'à la **validation QR** à la livraison.

---

## Récap express

| Étape | Où | Action |
|---|---|---|
| Code | backend + functions | ✅ fait (routage `recipient`, tests 34/34, lien démo) |
| Webhook | Console D7 | ✅ les deux numéros → **même** webhook backend |
| Déploiement | Render (service prod existant) | pousser le code ; aucune nouvelle var |
| Test | WhatsApp | écrire `PD3431` au `+1 555…` → réponse depuis le numéro démo |
| Prod | — | **inchangée** (repli par défaut si pas de `recipient`) |
