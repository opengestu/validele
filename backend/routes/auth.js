const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Use Supabase Admin client if environment variables are present
let supabaseAdmin = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }
} catch (e) {
  console.warn('Supabase client not available:', e.message);
}

function ensureSupabase(req, res) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Supabase admin client not configured on server.' });
  }
  return null;
}

// GET /auth/users/exists?phone=+2217xxxxxxx
router.get('/users/exists', async (req, res) => {
  const phone = (req.query.phone || '').toString();
  if (!phone) return res.status(400).json({ error: 'Missing phone parameter' });

  const missing = ensureSupabase(req, res);
  if (missing) return missing;

  try {
    // Normalize phone and search permissively by the last 9 digits to tolerate different formats
    let formatted = phone.replace(/[\s\-\(\)]/g, '');
    if (!formatted.startsWith('+')) {
      if (formatted.startsWith('221')) formatted = `+${formatted}`;
      else if (formatted.startsWith('0')) formatted = `+221${formatted.substring(1)}`;
      else formatted = `+221${formatted}`;
    }
    const last9 = formatted.replace(/\D/g, '').slice(-9);

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role, pin_hash, phone')
      .ilike('phone', `%${last9}%`)
      .limit(1);

    if (error) return res.status(500).json({ error: error.message || 'Database error' });

    if (Array.isArray(data) && data.length > 0) {
      const p = data[0];
      return res.json({ exists: true, profile: { id: p.id, full_name: p.full_name, role: p.role, hasPin: !!p.pin_hash, phone: p.phone } });
    }

    return res.json({ exists: false });
  } catch (e) {
    console.error('Error checking user existence:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// POST /auth/login-pin
// body: { phone: string, pin: string }
router.post('/login-pin', async (req, res) => {
  const { phone, pin } = req.body || {};
  if (!phone || !pin) return res.status(400).json({ error: 'Missing phone or pin' });

  const missing = ensureSupabase(req, res);
  if (missing) return missing;

  try {
    // Normalize phone and search permissively by last 9 digits
    let formatted = (phone || '').replace(/[\s\-\(\)]/g, '');
    if (!formatted.startsWith('+')) {
      if (formatted.startsWith('221')) formatted = `+${formatted}`;
      else if (formatted.startsWith('0')) formatted = `+221${formatted.substring(1)}`;
      else formatted = `+221${formatted}`;
    }
    const last9 = formatted.replace(/\D/g, '').slice(-9);

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, pin_hash, phone')
      .ilike('phone', `%${last9}%`)
      .limit(1);

    if (error) return res.status(500).json({ error: error.message || 'Database error' });
    if (!Array.isArray(data) || data.length === 0) return res.status(401).json({ error: 'User not found' });

    const user = data[0];
    const pinHash = user.pin_hash;
    if (!pinHash) return res.status(401).json({ error: 'PIN not set for this user' });

    let verified = false;
    try {
      // If pinHash looks like a bcrypt hash, use bcrypt.compare
      if (/^\$2[aby]\$/.test(String(pinHash))) {
        verified = await bcrypt.compare(String(pin), String(pinHash));
      } else {
        // Fallback to plain equality for legacy plaintext storage
        verified = String(pin) === String(pinHash);
        // If verified and stored as plain, migrate to bcrypt hash
        if (verified) {
          try {
            const newHash = await bcrypt.hash(String(pin), 10);
            await supabaseAdmin.from('profiles').update({ pin_hash: newHash }).eq('id', user.id);
            console.log('[AUTH] Migrated plaintext PIN to bcrypt for user', user.id);
          } catch (migErr) {
            console.error('[AUTH] Failed migrating PIN hash for user', user.id, migErr);
          }
        }
      }
    } catch (verErr) {
      console.error('PIN verification error:', verErr);
    }

    if (!verified) return res.status(401).json({ error: 'Invalid PIN' });

    // Issue JWT if configured
    const jwtSecret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
    if (jwtSecret) {
      const token = jwt.sign({ sub: user.id, phone: user.phone }, jwtSecret, { expiresIn: '7d' });
      return res.json({ success: true, token });
    }

    return res.json({ success: true });
  } catch (e) {
    console.error('Error during PIN login:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
