const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log('DEBUG Render ENV SUPABASE_URL:', url);
console.log('DEBUG Render ENV SUPABASE_SERVICE_ROLE_KEY:', key ? 'OK' : 'MISSING');
if (!url || !key) {
  throw new Error(
    "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant. Configurez le fichier .env (voir backend/.env.example)."
  );
}

const supabase = createClient(url, key);

module.exports = { supabase };