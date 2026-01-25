Auth endpoints added:

- GET /auth/users/exists?phone=+2217xxxxxxx
  - Response: { exists: boolean }

- POST /auth/login-pin
  - Body: { phone: string, pin: string }
  - Response: { success: true, token?: string } or { error: '...' }

Requirements:
- SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the backend environment to allow server-side queries of the `profiles` table.
- Optionally set JWT_SECRET (or SUPABASE_JWT_SECRET) to enable token issuance.
- Install new dependencies in backend:
  - @supabase/supabase-js
  - bcryptjs
  - jsonwebtoken

Run:
  cd backend
  npm install @supabase/supabase-js bcryptjs jsonwebtoken
  npm run start

Notes:
- This implementation expects a `profiles` table with columns `phone` and `pin_hash` (bcrypt hashed pin). If the PIN is not stored, login-pin will return an error.
- Phone signup flow continues to use the existing PhoneForm and OTP process on the frontend.
