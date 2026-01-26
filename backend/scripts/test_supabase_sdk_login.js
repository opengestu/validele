#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

(async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';
  if (!SUPABASE_URL || !ANON) {
    console.error('Missing SUPABASE_URL or anon key');
    process.exit(2);
  }
  const supabase = createClient(SUPABASE_URL, ANON);

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: 'ndjibril997@gmail.com', password: 'Nd!@ye0912$' });
    console.log('SDK result:', { data: data ?? null, error: error ?? null });
    if (error) process.exit(1);
  } catch (err) {
    console.error('ERR', err.message || err);
    process.exit(1);
  }
})();