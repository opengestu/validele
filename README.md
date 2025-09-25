# Supabase & Env setup

- Backend: set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env` (service role key must remain server-side).
- Frontend (Vite): create `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (anon/public key).
- Do NOT expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code or commit it to source control.

## Backend Servers

Ce projet dispose de deux serveurs backend :

### 1. Serveur TypeScript (Recommandé - Port 3001)

```bash
cd backend
npm start
```

- Structure modulaire avec routes et services séparés
- Support du formatage automatique des numéros Orange Money
- Logs détaillés pour le débogage

### 2. Serveur JavaScript (Port 5000)

```bash
cd backend
node server.js
```

- Serveur simple en un seul fichier
- Support HTTPS avec certificats locaux
- Également corrigé pour Orange Money

**Note**: Les deux serveurs ont été corrigés pour le problème "Numéro de téléphone invalide" d'Orange Money en formatant automatiquement les numéros sénégalais au format `+221XXXXXXXX`.

## Welcome to your Lovable project

## Project info

**URL**: <https://lovable.dev/projects/a6811646-579a-4191-b5ff-9efcf197e3d1>

## How can I edit this code?

There are several ways of editing your application.

### Use Lovable

Simply visit the [Lovable Project](https://lovable.dev/projects/a6811646-579a-4191-b5ff-9efcf197e3d1) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

### Use your preferred IDE

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

### Edit a file directly in GitHub

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

### Use GitHub Codespaces

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/a6811646-579a-4191-b5ff-9efcf197e3d1) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

### Passage en production

1. Remplacez toutes les URLs PayDunya par les URLs de production (`https://app.paydunya.com/api/v1`)
2. Mettez les vraies clés PayDunya de production dans le `.env` du backend
3. Déployez le backend sur un serveur HTTPS public (Render, Railway, VPS, etc.)
4. Déployez le frontend sur une plateforme HTTPS (Vercel, Netlify, etc.)
5. Configurez le webhook PayDunya pour pointer vers l'URL publique du backend
6. Testez un paiement réel avec un petit montant
7. Sécurisez les variables d'environnement et les accès (ne jamais exposer les clés privées)
8. Vérifiez les règles RLS Supabase pour la sécurité des données
