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
      .select('id, full_name, role, pin_hash, phone, wallet_type, company_name, vehicle_info, created_at, updated_at, push_token, address')
      .ilike('phone', `%${last9}%`)
      .limit(1);

    if (error) return res.status(500).json({ error: error.message || 'Database error' });

    if (Array.isArray(data) && data.length > 0) {
      const p = data[0];
      return res.json({
        exists: true,
        profile: {
          id: p.id,
          full_name: p.full_name,
          role: p.role,
          hasPin: !!p.pin_hash,
          phone: p.phone,
          wallet_type: p.wallet_type,
          company_name: p.company_name,
          vehicle_info: p.vehicle_info,
          created_at: p.created_at,
          updated_at: p.updated_at,
          push_token: p.push_token,
          address: p.address
        }
      });
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
      .select('id, pin_hash, phone, role')
      .ilike('phone', `%${last9}%`)
      .limit(1);

    if (error) {
      console.error('[LOGIN-PIN] DB error:', error);
      return res.status(500).json({ error: error.message || 'Database error' });
    }
    if (!Array.isArray(data) || data.length === 0) {
      console.warn('[LOGIN-PIN] User not found for phone:', phone, 'last9:', last9);
      return res.status(401).json({ error: 'User not found' });
    }

    const user = data[0];

    // SECURITY: disallow PIN-based login for admin profiles
    if (user && user.role === 'admin') {
      console.warn('[LOGIN-PIN] PIN login attempt blocked for admin profile:', user.id);
      return res.status(403).json({ error: 'PIN login disabled for admin; please use email/password' });
    }

    const pinHash = user.pin_hash;
    console.log('[LOGIN-PIN] PIN reçu:', pin);
    console.log('[LOGIN-PIN] PIN hash stocké:', pinHash);
    let verified = false;
    try {
      // If pinHash looks like a bcrypt hash, use bcrypt.compare
      if (/^\$2[aby]\$/.test(String(pinHash))) {
        verified = await bcrypt.compare(String(pin), String(pinHash));
        console.log('[LOGIN-PIN] Résultat bcrypt.compare:', verified);
      } else {
        // Fallback to plain equality for legacy plaintext storage
        verified = String(pin) === String(pinHash);
        console.log('[LOGIN-PIN] Résultat égalité simple:', verified);
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
      console.error('[LOGIN-PIN] PIN verification error:', verErr);
    }

    if (!verified) {
      console.warn('[LOGIN-PIN] PIN incorrect. PIN reçu:', pin, '| PIN hash stocké:', pinHash);
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    // Issue JWT if configured
    const jwtSecret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
    if (jwtSecret) {
      // Create a JWT compatible with Supabase RLS expectations: include `sub` (user id)
      // and a simple `role` claim to help policies if needed.
      const token = jwt.sign({ sub: user.id, role: 'authenticated', phone: user.phone }, jwtSecret, { expiresIn: '7d' });
      // Return a conventional access_token name so clients can inject it directly into Realtime
      return res.json({ success: true, access_token: token, expires_in: 7 * 24 * 3600 });
    }

    return res.json({ success: true });
  } catch (e) {
    console.error('[LOGIN-PIN] Error during PIN login:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Debug: récupérer un utilisateur Supabase par email (admin)
router.get('/users/by-email', async (req, res) => {
  const email = (req.query.email || '').toString();
  if (!email) return res.status(400).json({ error: 'Missing email parameter' });

  const missing = ensureSupabase(req, res);
  if (missing) return missing;

  try {
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) return res.status(500).json({ error: error.message || 'Error listing users' });
    const found = users.users.find(u => u.email === email);
    if (!found) return res.status(404).json({ found: false });
    return res.json({ found: true, user: found });
  } catch (err) {
    console.error('Error in /users/by-email:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Endpoint pour migrer un PIN en le sauvegardant haché dans profiles (admin only)
router.post('/migrate-pin', async (req, res) => {
  const { profileId, pin } = req.body || {};
  if (!profileId || !pin) return res.status(400).json({ error: 'Missing profileId or pin' });

  const missing = ensureSupabase(req, res);
  if (missing) return missing;

  try {
    const hashed = await bcrypt.hash(String(pin), 10);
    const { error } = await supabaseAdmin.from('profiles').update({ pin_hash: hashed }).eq('id', profileId);
    if (error) {
      console.error('[AUTH] Error migrating PIN:', error);
      return res.status(500).json({ error: 'Failed to migrate PIN' });
    }
    console.log('[AUTH] Migrated PIN for profile', profileId);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error in /migrate-pin:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Endpoint pour permettre aux clients SMS (sans session Supabase) de mettre à jour
// leur profil via le backend admin (utilise supabaseAdmin pour bypasser RLS).
router.post('/profile/update', async (req, res) => {
  const missing = ensureSupabase(req, res);
  if (missing) return missing;

  const { profileId, full_name, phone, wallet_type, company_name, vehicle_info, address, push_token } = req.body || {};
  if (!profileId) return res.status(400).json({ error: 'Missing profileId' });

  try {
    const updatePayload = {};
    if (typeof full_name === 'string') updatePayload.full_name = full_name;
    if (typeof phone === 'string') updatePayload.phone = phone;
    if (typeof wallet_type !== 'undefined') updatePayload.wallet_type = wallet_type;
    if (typeof company_name !== 'undefined') updatePayload.company_name = company_name;
    if (typeof vehicle_info !== 'undefined') updatePayload.vehicle_info = vehicle_info;
    if (typeof address !== 'undefined') updatePayload.address = address;
    if (typeof push_token !== 'undefined') updatePayload.push_token = push_token;

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updatePayload)
      .eq('id', profileId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('[AUTH] profile.update error', error);
      return res.status(500).json({ error: error.message || 'Failed to update profile' });
    }

    return res.json({ success: true, profile: data });
  } catch (err) {
    console.error('[AUTH] /profile/update error', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Endpoint admin pour récupérer un profil par id (utile pour frontends non-auth comme SMS sessions)
router.get('/profile/:id', async (req, res) => {
  const missing = ensureSupabase(req, res);
  if (missing) return missing;

  const id = (req.params && req.params.id) ? String(req.params.id) : null;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[AUTH] profile.get error', error);
      return res.status(500).json({ error: error.message || 'Failed to fetch profile' });
    }

    if (!data) return res.status(404).json({ error: 'Profile not found' });

    return res.json({ success: true, profile: data });
  } catch (err) {
    console.error('[AUTH] /profile/:id error', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
