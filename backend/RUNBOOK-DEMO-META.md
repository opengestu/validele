# Runbook — Numéro DÉMO autonome sur Meta Cloud API

Le numéro démo vit sur **Meta Cloud API en direct**, indépendamment de Direct7.
La prod (`221768171175`) **reste sur D7 et n'est pas touchée**.

| | Prod | Démo |
|---|---|---|
| Numéro | `221768171175` | `221756509302` |
| Transporteur | Direct7 (`backend/direct7.js`) | Meta Cloud API (`backend/meta-whatsapp.js`) |
| Webhook | `POST /api/whatsapp/webhook/:secret` | `GET`+`POST /api/whatsapp/webhook/meta/:secret` |
| Auth webhook | secret d'URL | secret d'URL **+** `X-Hub-Signature-256` |
| Fallback SMS | actif (D7) | aucun (trace seule) |
| Données | réelles | `is_demo = true` |

## Pourquoi ça ne duplique aucune logique

`decideReplies` renvoie des descripteurs (`{kind:'text'|'buttons'|'cta'|'list'}`)
et `executeAction` les passe aux senders **injectés** dans `createBot`. Le cerveau
du bot ignore donc totalement qui transporte ses messages.

Le seul changement dans `whatsapp-bot.js` est l'injection des parsers, avec le
défaut D7 conservé — comportement historique strictement inchangé :

```js
const parseMessage = deps.parseMessage || parseD7Message;
const parseStatusEvent = deps.parseStatusEvent || parseD7StatusEvent;
```

`parseMetaMessage` renvoie exactement les mêmes clés que `parseD7Message`
(`{msgId, from, to, type, text, buttonId, raw}`), `to` étant tiré de
`metadata.display_phone_number` — le vrai numéro, pas le `phone_number_id`.
C'est lui qui alimente `isDemoBotNumber()` et fige `orders.bot_number`.

## Garde-fou anti-mélange

`resolvePhoneNumberId()` **refuse** d'émettre si le `from` demandé n'est pas le
numéro démo. Une notification prod mal routée échoue bruyamment au lieu de partir
en douce par le mauvais canal. Testé (`émettre depuis le numéro PROD via Meta ->
refus explicite`).

---

## Étape 1 — Variables d'environnement

Dans `backend/.env` (et sur Render) — cf. le bloc `META_*` de `.env.example` :

```bash
META_BOT_NUMBER=221756509302
META_PHONE_NUMBER_ID=1346261105228979
META_ACCESS_TOKEN=<token System User permanent>
META_APP_SECRET=<App secret Meta>
META_WEBHOOK_VERIFY_TOKEN=<choisi par toi>
META_WEBHOOK_SECRET=<choisi par toi, ira dans l'URL>

# Indispensable : sans ça le catalogue démo reste invisible depuis ce numéro
# et les commandes ne sont PAS marquées is_demo.
WHATSAPP_DEMO_BOT_NUMBERS=15554677146,221756509302
```

> Sans `META_ACCESS_TOKEN` + `META_PHONE_NUMBER_ID` + `META_BOT_NUMBER`, le bot
> démo **ne se monte pas du tout** (log `[META] Bot demo non monte`). C'est le
> comportement voulu en dev et en CI.

> Sans `META_APP_SECRET`, la route se monte mais **tous les POST sont rejetés en
> 401**. Le log de démarrage le signale explicitement.

## Étape 2 — Vérifier l'état du numéro (aucun message envoyé)

```bash
node backend/scripts/meta-send-test.js --check
```

Affiche le `name_status` du numéro. **C'est la réponse directe à la question du
Display Name** — `APPROVED` ou non — sans dépenser un message ni attendre un rejet.

## Étape 3 — Envoi réel

```bash
node backend/scripts/meta-send-test.js 221774254729
```

Le script décode les rejets fréquents (`#131037` display name, `#131030`
destinataire non autorisé, `#131047` fenêtre 24h, `#190` token expiré).

⚠️ « Accepté par Meta » ≠ « remis ». Le rejet peut arriver après coup dans le
webhook de statut — surveiller les logs `[META][DEMO] message non remis`.

## Étape 4 — Abonner le webhook

Console Meta → ton App → WhatsApp → Configuration :

```
Callback URL : https://<backend>.onrender.com/api/whatsapp/webhook/meta/<META_WEBHOOK_SECRET>
Verify token : <META_WEBHOOK_VERIFY_TOKEN>
```

Champs à cocher : `messages`. Meta appelle d'abord le `GET` avec `hub.challenge` ;
le serveur le renvoie en texte brut si le secret d'URL **et** le verify token
correspondent.

## Étape 5 — Test live de bout en bout

Depuis un téléphone, écrire **`PD0000`** au numéro démo.
Attendu : fiche produit + boutons, émis depuis `221756509302`.

Contrôle croisé d'isolation : le même `PD0000` envoyé au numéro **prod** doit
rester **introuvable** (filtre `allowDemo`, `whatsapp-bot.js`).

Prérequis : migrations `008`/`009` appliquées et
`node backend/scripts/seed-demo-catalog.js` exécuté, sinon `PD0000` n'existe pas
en base et le bot répond « code introuvable » — ce qui n'a rien à voir avec Meta.

---

## Tests

```bash
cd backend
npm run test:wabot   # 59 tests — parcours D7 (non-régression)
npm run test:meta    # 35 tests — transporteur Meta + route webhook
```

Les tests Meta sont hermétiques : `axios.post` est intercepté, la route webhook
est montée sur un express jetable sur port éphémère. Aucun réseau, aucune DB.

## Limite connue — notifications post-commande

`orders.bot_number` fige le numéro pour les messages ultérieurs (livraison,
remboursement). Ces notifications passent par les helpers D7
(`notifyDeliveryStartedWithFallback`) : pour une commande démo, elles
échoueraient sur le garde-fou de `resolvePhoneNumberId`.

**En l'état, le parcours démo va jusqu'au paiement** — ce qui suffit à une
démonstration commerciale. Pour aller au-delà, il faudra router ces notifications
par transporteur selon `orders.bot_number`.
