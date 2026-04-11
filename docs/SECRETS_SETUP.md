# Environment Variables Setup

This project uses two deployment environments:
- Frontend: Cloudflare Pages
- Backend: Render

Important:
- Variables starting with VITE_ are exposed in browser bundles.
- Never put private provider keys or service_role keys in VITE_ variables.

## Cloudflare Pages (Frontend)

Add these in Cloudflare Pages -> Settings -> Variables and Secrets:

Required:
- VITE_API_BASE_URL=https://your-backend.onrender.com
- VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
- VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>

Recommended for compatibility with current codebase:
- VITE_API_URL=https://your-backend.onrender.com
- VITE_API_BASE=https://your-backend.onrender.com
- VITE_ADMIN_USER_ID=<admin-profile-uuid>
- VITE_ADMIN_ONLY_MODE=false
- VITE_PAYDUNYA_MODE=prod

Optional local-only value (do not set in production Pages unless needed):
- VITE_DEV_BACKEND=http://localhost:5000

Do NOT add real secrets in frontend variables:
- VITE_PAYDUNYA_MASTER_KEY
- VITE_PAYDUNYA_PRIVATE_KEY
- VITE_PAYDUNYA_TOKEN

## Render (Backend)

Add these in Render -> Service -> Environment:

Required:
- NODE_ENV=production
- PORT=5000
- SUPABASE_URL=https://<your-project-ref>.supabase.co
- SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
- JWT_SECRET=<long-random-secret>
- ADMIN_JWT_SECRET=<another-long-random-secret>
- ADMIN_USER_ID=<admin-profile-uuid>
- VITE_DEV_ORIGIN=https://your-project.pages.dev

Payment and notification providers (required if those features are enabled):
- DIRECT7_API_KEY=<direct7-api-key>
- D7_API_KEY_NOTIFY=<direct7-notify-api-key>
- PAYDUNYA_MODE=prod
- PAYDUNYA_MASTER_KEY=<paydunya-master-key>
- PAYDUNYA_PRIVATE_KEY=<paydunya-private-key>
- PAYDUNYA_PUBLIC_KEY=<paydunya-public-key>
- PAYDUNYA_TOKEN=<paydunya-token>
- PAYDUNYA_CALLBACK_URL=https://your-backend.onrender.com/api/paydunya/callback
- PIXPAY_API_KEY=<pixpay-api-key>
- PIXPAY_BUSINESS_ID=<pixpay-business-id>

Recommended defaults:
- ADMIN_TOKEN_TTL=3600
- FORCE_APP_UPDATE=false
- APP_LATEST_VERSION=1.0.0
- APP_UPDATE_MESSAGE=A new app version is available.
- ENABLE_PAYOUT_SCHEDULER=false
- ENABLE_PAYMENT_RECONCILER=false

## Files Updated In Repository

- .env.example
- backend/.env.example

Use these templates as the source of truth when adding variables to Cloudflare and Render.
