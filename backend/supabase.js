const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_CLIENT_KEY || '';
console.log('DEBUG Render ENV SUPABASE_URL:', url);
console.log('DEBUG Render ENV SUPABASE_SERVICE_ROLE_KEY:', serviceKey ? 'OK' : 'MISSING');
console.log('DEBUG Render ENV SUPABASE_ANON_KEY:', anonKey ? 'OK' : 'MISSING');

let supabase = null;
try {
  if (!url) {
    console.warn('[SUPABASE] SUPABASE_URL missing; supabase client will not be available. Some routes may be limited.');
  } else if (serviceKey) {
    supabase = createClient(url, serviceKey);
    console.log('[SUPABASE] Initialized admin client with service_role key');
  } else if (anonKey) {
    supabase = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    console.warn('[SUPABASE] SUPABASE_SERVICE_ROLE_KEY missing; initialized anon client (limited RLS).');
  } else {
    console.warn('[SUPABASE] No suitable Supabase key found; supabase client not initialized.');
  }
} catch (e) {
  console.error('[SUPABASE] Failed to initialize supabase client:', e?.message || e);
  supabase = null;
}

module.exports = { supabase };