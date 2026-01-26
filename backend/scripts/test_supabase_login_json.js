#!/usr/bin/env node
require('dotenv').config();

(async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';
  if (!SUPABASE_URL || !ANON) {
    console.error('Missing SUPABASE_URL or anon key');
    process.exit(2);
  }

  const body = JSON.stringify({ grant_type: 'password', email: 'ndjibril997@gmail.com', password: 'Nd!@ye0912$' });
  console.log('DEBUG JSON POST', `${SUPABASE_URL}/auth/v1/token`, 'bodySnippet:', body.slice(0,200));

  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON }, body });
    const text = await r.text();
    console.log('STATUS', r.status);
    console.log('BODY', text);
    if (!r.ok) process.exit(1);
  } catch (err) {
    console.error('ERR', err.message || err);
    process.exit(1);
  }
})();