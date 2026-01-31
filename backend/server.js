// Route /paymentsuccess moved below (after app initialization) to avoid ReferenceError when loading in production.
// (original location removed)

// backend/server.js
// INSPECT: server.js - checking DB and routes
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();
// Support both SUPABASE_ANON_KEY and VITE_SUPABASE_ANON_KEY used on Render
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_CLIENT_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY_SOURCE = process.env.SUPABASE_ANON_KEY ? 'SUPABASE_ANON_KEY' : (process.env.VITE_SUPABASE_ANON_KEY ? 'VITE_SUPABASE_ANON_KEY' : (process.env.SUPABASE_KEY ? 'SUPABASE_KEY' : (process.env.SUPABASE_CLIENT_KEY ? 'SUPABASE_CLIENT_KEY' : null)));
if (SUPABASE_ANON_KEY_SOURCE) {
  console.log('[ADMIN] Supabase anon key source:', SUPABASE_ANON_KEY_SOURCE);
} else {
  console.warn('[ADMIN] Supabase anon key not found in environment (SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY)');
}
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
// Supabase helper: createClient may be needed in some routes; also expose global `supabase`
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL || '';
let supabase;
try {
  const sb = require('./supabase');
  supabase = sb.supabase;
} catch (e) {
  // fail gracefully - some routes create a client on demand using createClient
  console.warn('[INIT] Could not require ./supabase (it may be optional):', e?.message || e);
}
const JWT_SECRET = process.env.JWT_SECRET || 'votre-secret-très-long-et-sécurisé-changez-le';
const cookieParser = require('cookie-parser');
const { sendOTP, verifyOTP } = require('./direct7');
const { sendPushNotification, sendPushToMultiple, sendPushToTopic } = require('./firebase-push');
const notificationService = require('./notification-service');

const { initiatePayment: pixpayInitiate, initiateWavePayment: pixpayWaveInitiate, sendMoney: pixpaySendMoney } = require('./pixpay');


const app = express();

// CORS global, avant toute route
const FRONTEND_ORIGIN = process.env.VITE_DEV_ORIGIN || null;
const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser (curl) or same-origin server requests
    if (!origin) return callback(null, true);
    // Allow explicit VITE_DEV_ORIGIN
    if (FRONTEND_ORIGIN && origin === FRONTEND_ORIGIN) return callback(null, true);
    // Allow any localhost or 127.0.0.1 on any port (dev convenience)
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Authorization']
};
app.use(cors(corsOptions));
app.use(express.json({
  // Capture raw body for better debugging of invalid JSON requests (kept truncated when logged)
  verify: (req, res, buf, encoding) => {
    try {
      req.rawBody = buf.toString(encoding || 'utf8');
    } catch (e) {
      req.rawBody = '';
    }
  }
}));
app.use(cookieParser());

// Helper: normalize a provider/raw response into a JSON object for DB jsonb columns
function normalizeJsonField(val) {
  try {
    if (val === undefined || val === null) return null;
    if (typeof val === 'object') return val;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed === '') return null;
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try { return JSON.parse(trimmed); } catch (e) { return { message: trimmed }; }
      }
      return { message: trimmed };
    }
    // numbers/booleans -> wrap
    return { value: val };
  } catch (e) {
    return { message: String(val) };
  }
}

// Mount auth routes (added for phone existence check and PIN login)
try {
  const authRoutes = require('./routes/auth');
  app.use('/auth', authRoutes);
} catch (e) {
  console.warn('Auth routes module not found or failed to load:', e.message);
}

process.on('uncaughtException', function (err) {
  console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', function (reason, p) {
  console.error('UNHANDLED REJECTION:', reason);
});

// Force le parsing URL-encoded pour les formulaires
app.use(express.urlencoded({ extended: true }));

// Middleware de gestion d'erreur globale pour attraper les erreurs de parsing JSON
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    const raw = String(req.rawBody || '');
    // Mask password values to avoid logging secrets
    const masked = raw.replace(/("password"\s*:\s*)"([^"]+)"/gi, '$1"***"').replace(/('password'\s*:\s*)'([^']+)'/gi, "$1'***'");
    console.error('Bad JSON:', err.message, 'rawSnippet:', masked.slice(0, 200));

    const hint = "Vérifiez que le body est du JSON valide. PowerShell: Invoke-RestMethod -Uri 'https://<votre-backend>/api/admin/login' -Method Post -ContentType 'application/json' -Body (@{ email='..'; password='..' } | ConvertTo-Json). Avec curl sur Windows, préférez 'curl.exe' ou utilisez un fichier payload.json et 'curl -d @payload.json'.";

    return res.status(400).json({ success: false, message: 'Requête JSON invalide.', hint });
  }
  next();
});

// Middleware: rafraîchissement automatique des tokens JWT personnalisés (SMS tokens)
const refreshTokenIfNeeded = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) return next();

    const token = authHeader.split(' ')[1];
    let decoded = null;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      // invalid or expired - attempt to decode without verify
      try { decoded = jwt.decode(token); } catch (e2) { decoded = null; }
    }

    if (!decoded || !decoded.exp) return next();

    const now = Math.floor(Date.now() / 1000);
    // If token expires in less than 5 minutes, issue a new one
    if ((decoded.exp - now) < 300) {
      try {
        const newToken = jwt.sign(
          {
            sub: decoded.sub,
            phone: decoded.phone,
            auth_mode: decoded.auth_mode || 'sms',
            role: decoded.role
          },
          JWT_SECRET,
          { expiresIn: '1h' }
        );
        // Expose the new token to the client in a header
        res.setHeader('X-New-Access-Token', newToken);
        console.log('[TOKEN-REFRESH] Issued new JWT for sub:', decoded.sub);
      } catch (e) {
        console.warn('[TOKEN-REFRESH] failed to sign new token:', e?.message || e);
      }
    }

    return next();
  } catch (err) {
    console.error('❌ refreshTokenIfNeeded error:', err);
    return next();
  }
};

// Appliquer le middleware aux routes API critiques
app.use('/api/vendor', refreshTokenIfNeeded);
app.use('/api/delivery', refreshTokenIfNeeded);
app.use('/api/buyer', refreshTokenIfNeeded);

// Debug: token info endpoint for diagnosing session vs JWT issues
app.get('/api/debug/token-info', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization || null;
    const tokenInfo = { hasHeader: !!authHeader, headerLength: authHeader?.length || 0, isBearer: !!(authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) };
    if (tokenInfo.isBearer) {
      const token = authHeader.split(' ')[1];
      tokenInfo.token = 'present';
      try {
        const decoded = jwt.decode(token, { complete: true });
        tokenInfo.jwtDecoded = { header: decoded?.header || null, payload: decoded?.payload || null };
      } catch (e) { tokenInfo.jwtError = String(e.message || e); }

      try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        tokenInfo.supabaseAuth = { hasUser: !!user, userId: user?.id || null, error: error?.message || null };
      } catch (e) { tokenInfo.supabaseError = String(e.message || e); }

      try {
        const verified = jwt.verify(token, JWT_SECRET);
        tokenInfo.customJwtValid = true;
        tokenInfo.customJwtExp = verified.exp;
        tokenInfo.customJwtExpired = verified.exp < Math.floor(Date.now() / 1000);
      } catch (e) { tokenInfo.customJwtInvalid = String(e.message || e); }
    }

    return res.json({ success: true, tokenInfo });
  } catch (err) {
    console.error('[DEBUG] token-info error:', err);
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// ==========================================
// ICI : place ta route add-product
// ==========================================
// Endpoint sécurisé pour ajout produit par un vendeur (bypass RLS pour session SMS)
app.post('/api/vendor/add-product', async (req, res) => {
  try {
    // DEBUG: log raw request & headers (truncate rawBody to 1000 chars)
    try {
      const raw = String(req.rawBody || '');
      console.log('[DEBUG] /api/vendor/add-product rawBodySnippet:', raw.slice(0, 1000));
    } catch (ex) {
      console.warn('[DEBUG] /api/vendor/add-product failed to read rawBody:', ex?.message || ex);
    }
    console.log('[DEBUG] /api/vendor/add-product headers.authorization:', req.headers.authorization?.slice(0, 200));

    const { vendor_id, name, price, description, warranty, code, is_available, stock_quantity } = req.body || {};
    if (!vendor_id || !name || !price || !description || !code) {
      return res.status(400).json({ success: false, error: 'Champs obligatoires manquants' });
    }
    // Vérification d'authentification (Bearer token)
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentification requise (Bearer token manquant)' });
    }
    const token = authHeader.split(' ')[1];
    let userId = null;
    let isSms = false;
    // 1. Essayer de décoder comme JWT SMS
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      console.log('[DEBUG] JWT decoded:', typeof decoded === 'object' ? JSON.stringify(decoded).slice(0, 1000) : String(decoded));
      // Accept any JWT we issue that contains `sub` as a valid SMS session token.
      if (decoded && decoded.sub) {
        userId = decoded.sub;
        // Mark as SMS only if explicit claim present
        isSms = decoded.auth_mode === 'sms' || decoded.role === 'vendor';
        console.log('[DEBUG] Token accepted as SMS session:', { userId, isSms });
      }
    } catch (e) {
      console.warn('[DEBUG] JWT verify failed:', e?.message || e);
      // Token not signed by our JWT_SECRET or invalid, continue to supabase check
    }
    // 2. Sinon, essayer comme token Supabase
    if (!userId) {
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
      console.log('[DEBUG] supabase.auth.getUser result:', { user: user ? { id: user.id, email: user.email } : null, authErr });
      if (authErr || !user) {
        return res.status(403).json({ success: false, error: 'Accès refusé : vendeur non autorisé' });
      }
      userId = user.id;
    }
    // Debug log détaillé pour diagnostiquer le mismatch d'identifiants et de types
    console.log('[DEBUG] userId:', userId, typeof userId, '| vendor_id:', vendor_id, typeof vendor_id, '| ==', userId == vendor_id, '| ===', userId === vendor_id);
    // Log la présence de la clé service_role
    console.log('[DEBUG] Supabase client insert: service_role?', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'YES' : 'NO', '| key starts with:', process.env.SUPABASE_SERVICE_ROLE_KEY ? process.env.SUPABASE_SERVICE_ROLE_KEY.slice(0, 8) : 'MISSING');
    // Comparaison forcée en string pour éviter tout bug de type ou d'espace
    if (String(userId) !== String(vendor_id)) {
      return res.status(403).json({ success: false, error: 'Accès refusé : vendeur non autorisé (id mismatch)' });
    }
    // Crée un client Supabase avec la clé service_role pour bypasser RLS (custom JWT, pas JWT Supabase)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from('products')
      .insert({
        vendor_id,
        name,
        price: Number(price),
        description,
        warranty,
        code,
        is_available: is_available !== undefined ? is_available : true,
        stock_quantity: stock_quantity !== undefined ? stock_quantity : 0
      });
    // Log le résultat de l'insert
    console.log('[DEBUG] Insert result:', { data, error });
    if (error) {
      console.error('[API] Erreur ajout produit:', error);
      return res.status(500).json({ success: false, error: error.message || 'Erreur insertion produit' });
    }
    return res.json({ success: true, product: data?.[0] });
  } catch (err) {
    console.error('[API] /api/vendor/add-product error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Endpoint de test
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is running!' });
});

// Admin: test SMS sending (POST JSON { to, text }) or GET with query params
app.all('/api/admin/test-sms', async (req, res) => {
  try {
    const method = req.method.toUpperCase();
    const to = (method === 'GET') ? req.query.to : (req.body && req.body.to);
    const text = (method === 'GET') ? req.query.text : (req.body && req.body.text);
    if (!to || !text) {
      return res.status(400).json({ success: false, error: 'to and text required' });
    }

    console.log('[ADMIN TEST SMS] to:', String(to).slice(0, 40), 'text:', String(text).slice(0, 160));

    if (!notificationService || typeof notificationService.sendSMS !== 'function') {
      console.error('[ADMIN TEST SMS] notificationService.sendSMS not available');
      return res.status(500).json({ success: false, error: 'notificationService.sendSMS not available on server' });
    }

    try {
      const result = await notificationService.sendSMS(String(to), String(text));
      console.log('[ADMIN TEST SMS] sendSMS result:', result);
      return res.json({ success: true, result });
    } catch (e) {
      console.error('[ADMIN TEST SMS] sendSMS exception:', e);
      return res.status(500).json({ success: false, error: String(e) });
    }
  } catch (err) {
    console.error('[ADMIN TEST SMS] handler error:', err);
    return res.status(500).json({ success: false, error: 'server_error' });
  }
});

// Endpoint sécurisé pour suppression produit par un vendeur (bypass RLS pour session SMS)
async function deleteProductHandler(req, res) {
  try {
    console.log('[DEBUG] /api/vendor/delete-product method:', req.method, 'rawBodySnippet:', String(req.rawBody || '').slice(0, 1000));
    const { vendor_id, product_id } = req.body || {};
    if (!vendor_id || !product_id) return res.status(400).json({ success: false, error: 'vendor_id et product_id requis' });

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentification requise (Bearer token manquant)' });
    }
    const token = authHeader.split(' ')[1];
    let userId = null;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded && decoded.sub) {
        userId = decoded.sub;
      }
    } catch (e) {
      console.warn('[DEBUG] /api/vendor/delete-product jwt verify failed:', e?.message || e);
    }

    if (!userId) {
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
      console.log('[DEBUG] supabase.auth.getUser for delete:', { user: user ? { id: user.id } : null, authErr });
      if (authErr || !user) return res.status(403).json({ success: false, error: 'Accès refusé : vendeur non autorisé' });
      userId = user.id;
    }

    if (String(userId) !== String(vendor_id)) {
      return res.status(403).json({ success: false, error: 'Accès refusé : vendeur non autorisé (id mismatch)' });
    }

    // Crée un client Supabase avec le JWT utilisateur pour respecter RLS
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data, error } = await supabase
      .from('products')
      .delete()
      .eq('id', product_id)
      .select();

    console.log('[DEBUG] delete result:', { data, error });
    if (error) {
      console.error('[API] Erreur suppression produit:', error);
      return res.status(500).json({ success: false, error: error.message || 'Erreur suppression produit' });
    }
    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, error: 'Produit introuvable ou non supprimé' });
    }
    return res.json({ success: true, deleted: data[0] });
  } catch (err) {
    console.error('[API] /api/vendor/delete-product error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}
app.post('/api/vendor/delete-product', deleteProductHandler);
app.delete('/api/vendor/delete-product', deleteProductHandler);

// Endpoint sécurisé pour modification de produit par un vendeur (bypass RLS pour session SMS)
app.post('/api/vendor/update-product', async (req, res) => {
  try {
    console.log('[DEBUG] /api/vendor/update-product rawBodySnippet:', String(req.rawBody || '').slice(0, 1000));
    const { vendor_id, product_id, updates } = req.body || {};
    if (!vendor_id || !product_id || !updates) return res.status(400).json({ success: false, error: 'vendor_id, product_id et updates requis' });

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentification requise (Bearer token manquant)' });
    }
    const token = authHeader.split(' ')[1];
    let userId = null;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded && decoded.sub) {
        userId = decoded.sub;
      }
    } catch (e) {
      console.warn('[DEBUG] /api/vendor/update-product jwt verify failed:', e?.message || e);
    }

    if (!userId) {
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
      console.log('[DEBUG] supabase.auth.getUser for update:', { user: user ? { id: user.id } : null, authErr });
      if (authErr || !user) return res.status(403).json({ success: false, error: 'Accès refusé : vendeur non autorisé' });
      userId = user.id;
    }

    if (String(userId) !== String(vendor_id)) {
      return res.status(403).json({ success: false, error: 'Accès refusé : vendeur non autorisé (id mismatch)' });
    }

    // Crée un client Supabase avec le JWT utilisateur pour respecter RLS
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', product_id)
      .select();

    console.log('[DEBUG] update result:', { data, error });
    if (error) {
      console.error('[API] Erreur modification produit:', error);
      return res.status(500).json({ success: false, error: error.message || 'Erreur modification produit' });
    }
    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, error: 'Produit introuvable ou non modifié' });
    }
    return res.json({ success: true, product: data[0] });
  } catch (err) {
    console.error('[API] /api/vendor/update-product error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Vendor orders endpoint — retourne les commandes d'un vendeur (sécurisé)
app.post('/api/vendor/orders', async (req, res) => {
  try {
    const { vendor_id } = req.body || {};
    if (!vendor_id) return res.status(400).json({ success: false, error: 'vendor_id requis' });

    console.log('[VENDOR ORDERS] Request for vendor:', vendor_id);

    // Utilisez le service role pour bypass RLS complètement
    // OU assurez-vous que le token a les bonnes permissions
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceRoleKey) {
      // Créez un client avec service role
      const { createClient } = require('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.SUPABASE_URL,
        serviceRoleKey
      );

      const { data, error } = await supabaseAdmin
        .from('orders')
        .select(`
          id,
          order_code,
          total_amount,
          status,
          buyer_id,
          product_id,
          delivery_person_id,
          created_at,
          updated_at,
          products(*),
          buyer:profiles!orders_buyer_id_fkey(full_name, phone),
          delivery:profiles!orders_delivery_person_id_fkey(full_name, phone),
          qr_code
        `)
        .eq('vendor_id', vendor_id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[API] /api/vendor/orders supabase error', error);
        return res.status(500).json({ 
          success: false, 
          error: error.message || 'Erreur DB'
        });
      }

      // Log and group by status for debugging
      console.log('[VENDOR ORDERS] Retrieved', Array.isArray(data) ? data.length : 0, 'orders');
      const byStatus = {};
      if (Array.isArray(data)) {
        for (const o of data) {
          byStatus[o.status] = (byStatus[o.status] || 0) + 1;
        }
      }

      // Attach payout batch info per order so the frontend (VendorDashboard) can show invoice links in order history
      try {
        const orderIds = (data || []).map(o => o.id).filter(Boolean);
        if (orderIds.length > 0) {
          const { data: batchItems, error: batchItemsErr } = await supabaseAdmin
            .from('payout_batch_items')
            .select('order_id,batch_id,status,provider_response')
            .in('order_id', orderIds);

          if (!batchItemsErr && batchItems && batchItems.length > 0) {
            const byOrder = {};
            for (const bi of batchItems) {
              byOrder[bi.order_id] = byOrder[bi.order_id] || [];
              byOrder[bi.order_id].push(bi);
            }

            for (const o of data) {
              o.payout_batches = byOrder[o.id] || [];
              o.payout_invoice_urls = (o.payout_batches || []).map(bi => `/api/vendor/payout-batches/${bi.batch_id}/invoice`);
            }
          }
        }
      } catch (attachErr) {
        console.warn('[VENDOR ORDERS] Failed to attach payout_batch info:', attachErr);
      }

      return res.json({ 
        success: true, 
        orders: data || [],
        count: data?.length || 0,
        byStatus,
        usingServiceRole: true,
        timestamp: new Date().toISOString()
      });
    } else {
      console.error('[API] /api/vendor/orders missing SUPABASE_SERVICE_ROLE_KEY - refusing to fall back to RLS-bound client');
      return res.status(500).json({ success: false, error: 'Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY required for this endpoint' });
    }
  } catch (err) {
    console.error('[API] /api/vendor/orders error', err);
    return res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur'
    });
  }
});

// Retourne les produits d'un vendeur (bypass RLS via service or token-aware endpoint)
app.post('/api/vendor/products', async (req, res) => {
  try {
    const { supabase } = require('./supabase');
    const { vendor_id } = req.body || {};
    if (!vendor_id) return res.status(400).json({ success: false, error: 'vendor_id requis' });

    const authHeader = req.headers.authorization || null;
    let userId = null;

    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && decoded.sub) userId = decoded.sub;
      } catch (e) {
        // try Supabase token
        try {
          const { data: { user }, error } = await supabase.auth.getUser(token);
          if (!error && user) userId = user.id;
        } catch (e2) { /* ignore */ }
      }
    }

    if (userId && String(userId) !== String(vendor_id)) {
      return res.status(403).json({ success: false, error: 'Accès refusé : vendor_id mismatch' });
    }

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('vendor_id', vendor_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[API] /api/vendor/products supabase error', error);
      return res.status(500).json({ success: false, error: error.message || 'Erreur DB' });
    }

    return res.json({ success: true, products: data || [] });
  } catch (err) {
    console.error('[API] /api/vendor/products error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Transactions (payouts/vendor payouts) liées aux commandes d'un vendor
app.get('/api/vendor/transactions', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let vendorId = req.query.vendor_id || req.query.vendorId;
    let userId = null;

    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && decoded.sub) userId = decoded.sub;
      } catch (e) {
        try {
          const { data: { user }, error } = await supabase.auth.getUser(token);
          if (!error && user) userId = user.id;
        } catch (e2) { /* ignore */ }
      }
    }

    if (!userId && vendorId) userId = vendorId;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentification requise (Bearer token ou vendor_id param)' });

    console.log('[VENDOR] fetching transactions for vendor:', userId);

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error('[VENDOR] SUPABASE_SERVICE_ROLE_KEY not configured - refusing to run RLS-bound queries');
      return res.status(500).json({ success: false, error: 'Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY required' });
    }

    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabaseAdmin = createClient(process.env.SUPABASE_URL, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

      const { data: orderRows, error: ordersError } = await supabaseAdmin
        .from('orders')
        .select('id')
        .eq('vendor_id', userId);

      if (ordersError) {
        console.error('[VENDOR] admin Error fetching orders for vendor transactions:', ordersError);
        return res.status(500).json({ success: false, error: 'Erreur serveur' });
      }

      const orderIds = (orderRows || []).map(r => r.id).filter(Boolean);
      if (orderIds.length === 0) return res.json({ success: true, transactions: [], count: 0, usingServiceRole: true });

      const { data, error } = await supabaseAdmin
        .from('payment_transactions')
        .select('*')
        .in('order_id', orderIds)
        .in('transaction_type', ['payout','vendor_payout'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[VENDOR] Error fetching transactions (admin):', error);
        return res.status(500).json({ success: false, error: 'Erreur serveur' });
      }

      if (process.env.DEBUG === 'true') {
        console.log('[VENDOR] /api/vendor/transactions count (admin):', Array.isArray(data) ? data.length : 0);
        return res.json({ success: true, transactions: data || [], debug: { count: Array.isArray(data) ? data.length : 0, sample: (data || []).slice(0,5) }, usingServiceRole: true, timestamp: new Date().toISOString() });
      }

      return res.json({ success: true, transactions: data || [], count: data?.length || 0, usingServiceRole: true, timestamp: new Date().toISOString() });
    } catch (e) {
      console.error('[VENDOR] admin client failed:', e);
      return res.status(500).json({ success: false, error: 'Server error querying as admin', details: String(e) });
    }
  } catch (err) {
    console.error('[VENDOR] /api/vendor/transactions error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Health check endpoint (pour monitoring Render et autres)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Recherche robuste d'une commande par code (order_code ou qr_code, statuts, nettoyage)
app.post('/api/orders/search', async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ success: false, error: 'Code de commande requis' });
    }
    // Nettoyage du code (majuscules, suppression espaces et caractères spéciaux)
    const cleaned = code.trim().replace(/[^a-z0-9]/gi, '').toUpperCase();
    const pattern = `%${cleaned}%`;
    console.log('[API/orders/search] Recherche code nettoyé:', cleaned);

    // Recherche dans la base (order_code ou qr_code, statuts paid/in_delivery)
    const { data, error } = await supabase
      .from('orders')
      .select(`*, products(name, code), buyer_profile:profiles!orders_buyer_id_fkey(full_name), vendor_profile:profiles!orders_vendor_id_fkey(phone, wallet_type)`)
      .or(`order_code.ilike.${pattern},qr_code.ilike.${pattern}`)
      .in('status', ['paid', 'in_delivery'])
      .maybeSingle();

    if (error) {
      console.error('[API/orders/search] Erreur requête:', error);
      return res.status(500).json({ success: false, error: 'Erreur DB', details: error.message });
    }

    if (data) {
      console.log('[API/orders/search] Commande trouvée:', data.id, data.order_code, data.status);
      return res.json({ success: true, order: data });
    } else {
      console.warn('[API/orders/search] Aucune commande trouvée pour code:', cleaned);
      return res.status(404).json({
        success: false,
        error: 'Commande non trouvée',
        code: cleaned,
        message: 'Aucune commande payée ou en cours trouvée avec ce code. Vérifiez le code et le statut.'
      });
    }
  } catch (err) {
    console.error('[API/orders/search] Exception:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur', details: String(err) });
  }
});

// Retourne les commandes pour un livreur (bypass RLS) — POST /api/delivery/my-orders
app.post('/api/delivery/my-orders', async (req, res) => {
  try {
    // Detailed debug logs: headers, raw body and parsed JSON
    try {
      console.log('[API/delivery/my-orders] headers.authorization:', String(req.headers.authorization || '').slice(0, 200));
      console.log('[API/delivery/my-orders] content-type:', req.headers['content-type']);
      const rawSnippet = String(req.rawBody || '').slice(0, 2000);
      console.log('[API/delivery/my-orders] rawBodySnippet:', rawSnippet.length > 0 ? rawSnippet : '<empty>');
    } catch (e) {
      console.warn('[API/delivery/my-orders] failed to log request debug info:', e?.message || e);
    }

    const { deliveryPersonId } = req.body || {};
    if (!deliveryPersonId) return res.status(400).json({ success: false, error: 'deliveryPersonId requis' });

    console.log('[API/delivery/my-orders] Request for deliveryPersonId:', deliveryPersonId);

    // Use service role client (required) for deterministic visibility
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error('[API/delivery/my-orders] SUPABASE_SERVICE_ROLE_KEY not configured - refusing to run RLS-bound query');
      return res.status(500).json({ success: false, error: 'Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY required' });
    }

    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabaseAdmin = createClient(process.env.SUPABASE_URL, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data, error } = await supabaseAdmin
        .from('orders')
        .select(`*, products(name, code), buyer_profile:profiles!orders_buyer_id_fkey(full_name, phone), vendor_profile:profiles!orders_vendor_id_fkey(full_name, phone)`)
        .eq('delivery_person_id', deliveryPersonId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[API/delivery/my-orders] admin query error:', error);
        return res.status(500).json({ success: false, error: 'Erreur DB', details: error.message });
      }

      console.log('[API/delivery/my-orders] admin query returned', Array.isArray(data) ? data.length : 0, 'orders');
      return res.json({ success: true, orders: data || [], count: data?.length || 0, usingServiceRole: true, timestamp: new Date().toISOString() });
    } catch (e) {
      console.error('[API/delivery/my-orders] admin client failed:', e);
      return res.status(500).json({ success: false, error: 'Server error querying as admin', details: String(e) });
    }
  } catch (err) {
    console.error('[API/delivery/my-orders] Exception:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur', details: String(err) });
  }
});

// DELIVERY: Transactions liées aux commandes attribuées à un livreur
app.get('/api/delivery/transactions', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let deliveryPersonId = req.query.delivery_person_id || req.query.deliveryPersonId;
    let userId = null;

    // 1) Try JWT (SMS sessions)
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && decoded.sub) {
          userId = decoded.sub;
        }
      } catch (e) {
        // not our JWT, try Supabase
        try {
          const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
          if (!authErr && user) userId = user.id;
        } catch (e2) {
          // ignore
        }
      }
    }

    // fallback to query param
    if (!userId && deliveryPersonId) userId = deliveryPersonId;

    if (!userId) return res.status(401).json({ success: false, error: 'Authentification requise (Bearer token ou delivery_person_id param)' });

    console.log('[DELIVERY] fetching transactions for deliveryPerson:', userId);

    // Use service role client (required) for deterministic visibility
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error('[DELIVERY] SUPABASE_SERVICE_ROLE_KEY not configured - refusing to run RLS-bound queries');
      return res.status(500).json({ success: false, error: 'Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY required' });
    }

    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabaseAdmin = createClient(process.env.SUPABASE_URL, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data: orderRows, error: ordersError } = await supabaseAdmin
        .from('orders')
        .select('id')
        .eq('delivery_person_id', userId);

      if (ordersError) {
        console.error('[DELIVERY] admin Error fetching orders for delivery person transactions:', ordersError);
        return res.status(500).json({ success: false, error: 'Erreur serveur' });
      }

      const orderIds = (orderRows || []).map(r => r.id).filter(Boolean);
      if (orderIds.length === 0) return res.json({ success: true, transactions: [], count: 0, usingServiceRole: true });

      const { data, error } = await supabaseAdmin
        .from('payment_transactions')
        .select('*')
        .in('order_id', orderIds)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[DELIVERY] Error fetching transactions (admin):', error);
        return res.status(500).json({ success: false, error: 'Erreur serveur' });
      }

      console.log('[DELIVERY] /api/delivery/transactions count (admin):', Array.isArray(data) ? data.length : 0);
      return res.json({ success: true, transactions: data || [], count: data?.length || 0, usingServiceRole: true, timestamp: new Date().toISOString() });
    } catch (e) {
      console.error('[DELIVERY] admin client failed:', e);
      return res.status(500).json({ success: false, error: 'Server error querying as admin', details: String(e) });
    }
    if (ordersError) {
      console.error('[DELIVERY] Error fetching orders for delivery person transactions:', ordersError);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }

    orderIds = (orderRows || []).map(r => r.id).filter(Boolean);
    if (orderIds.length === 0) return res.json({ success: true, transactions: [] });

    const { data, error } = await supabase
      .from('payment_transactions')
      .select('*')
      .in('order_id', orderIds)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[DELIVERY] Error fetching transactions:', error);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }

    if (process.env.DEBUG === 'true') {
      console.log('[DELIVERY] /api/delivery/transactions count:', Array.isArray(data) ? data.length : 0);
      return res.json({ success: true, transactions: data || [], debug: { count: Array.isArray(data) ? data.length : 0, sample: (data || []).slice(0,5) } });
    }

    return res.json({ success: true, transactions: data || [] });
  } catch (err) {
    console.error('[DELIVERY] /api/delivery/transactions error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});
// Debug: IP publique sortante du serveur (utile pour whitelister Direct7)
app.get('/api/debug/egress-ip', async (req, res) => {
  try {
    // ipify retourne l'IP publique vue depuis l'extérieur
    const { data } = await axios.get('https://api64.ipify.org?format=json', { timeout: 8000 });
    if (data && typeof data.ip === 'string') {
      return res.json({ ip: data.ip });
    }

    const { data: data2 } = await axios.get('https://api.ipify.org?format=json', { timeout: 8000 });
    return res.json({ ip: data2?.ip || null });
  } catch (error) {
    console.error('[DEBUG] Erreur récupération egress IP:', error?.message || error);
    return res.status(500).json({ error: 'Impossible de récupérer l\'IP sortante.' });
  }
});

// Debug: verify orders visibility with/without,  auth token (use to diagnose RLS problems)
app.get('/api/debug/orders-visibility', async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const anon = SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
    if (!SUPABASE_URL) return res.status(500).json({ error: 'SUPABASE_URL missing on server' });

    // 1) Query as anon (no Authorization header)
    const headersAnon = { apikey: anon };
    let anonCount = null;
    try {
      const r = await axios.get(`${SUPABASE_URL}/rest/v1/orders?select=id&limit=100`, { headers: headersAnon, timeout: 8000 });
      anonCount = Array.isArray(r.data) ? r.data.length : null;
    } catch (e) {
      anonCount = { error: String(e.message || e) };
    }

    // 2) Query as provided token (if any)
    const authHeader = req.headers.authorization || req.headers.Authorization || null;
    let withTokenCount = null;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const headersAuth = { apikey: anon, Authorization: `Bearer ${token}` };
      try {
        const r2 = await axios.get(`${SUPABASE_URL}/rest/v1/orders?select=id&limit=100`, { headers: headersAuth, timeout: 8000 });
        withTokenCount = Array.isArray(r2.data) ? r2.data.length : null;
      } catch (e) {
        withTokenCount = { error: String(e.message || e) };
      }
    }

    return res.json({ success: true, anonCount, withTokenCount, tokenProvided: !!authHeader });
  } catch (err) {
    console.error('[DEBUG] /api/debug/orders-visibility error:', err);
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// Debug: show user info for provided Bearer token
app.get('/api/debug/whoami', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization || null;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return res.status(400).json({ success: false, error: 'Missing Bearer token' });
    }
    const token = authHeader.split(' ')[1];
    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
      console.error('[DEBUG] /api/debug/whoami supabase auth.getUser error:', error);
      return res.status(400).json({ success: false, error: error.message || 'Invalid token' });
    }
    const user = data?.user || null;
    let profile = null;
    try {
      if (user && user.id) {
        const { data: p, error: perr } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (!perr) profile = p || null;
      }
    } catch (e) {
      console.warn('[DEBUG] /api/debug/whoami profile lookup failed:', e?.message || e);
    }
    return res.json({ success: true, user, profile });
  } catch (err) {
    console.error('[DEBUG] /api/debug/whoami error:', err);
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// Admin debug: list orders bypassing RLS (uses service_role client) — protected endpoint
app.get('/api/debug/admin/orders', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '200'), 10) || 200, 1000);
    const vendorId = req.query.vendor_id;
    let q = supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(limit);
    if (vendorId) q = q.eq('vendor_id', vendorId);
    const { data, error } = await q;
    if (error) {
      console.error('[DEBUG] /api/debug/admin/orders supabase error:', error);
      return res.status(500).json({ success: false, error: error.message || 'DB error' });
    }
    return res.json({ success: true, count: Array.isArray(data) ? data.length : 0, orders: data || [] });
  } catch (err) {
    console.error('[DEBUG] /api/debug/admin/orders error:', err);
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// Admin debug: view orders_audit entries for an order (requires admin)
app.get('/api/debug/admin/orders-audit', requireAdmin, async (req, res) => {
  try {
    const { order_id } = req.query || {};
    if (!order_id) return res.status(400).json({ success: false, error: 'order_id query param required' });

    const limit = Math.min(parseInt(String(req.query.limit || '200'), 10) || 200, 1000);
    const { data, error } = await supabase.from('orders_audit').select('*').eq('order_id', order_id).order('changed_at', { ascending: false }).limit(limit);
    if (error) {
      console.error('[DEBUG] /api/debug/admin/orders-audit supabase error:', error);
      return res.status(500).json({ success: false, error: error.message || 'DB error' });
    }
    return res.json({ success: true, count: Array.isArray(data) ? data.length : 0, audits: data || [] });
  } catch (err) {
    console.error('[DEBUG] /api/debug/admin/orders-audit error:', err);
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// Admin endpoint: run a one-shot reconciliation of pending transactions (will respect force flag)
app.post('/api/debug/admin/reconcile-payments', requireAdmin, async (req, res) => {
  const { forceConfirm = false, minutes, limit = 200 } = req.body || {};
  try {
    const reconcileMinutes = parseInt(minutes || process.env.PAYMENT_RECONCILE_MINUTES || '15', 10);
    const threshold = new Date(Date.now() - reconcileMinutes * 60 * 1000).toISOString();
    const { data: txs, error } = await supabase
      .from('payment_transactions')
      .select('*')
      .in('status', ['PENDING1','PENDING2'])
      .lte('created_at', threshold)
      .limit(limit);

    if (error) return res.status(500).json({ error: 'failed fetching transactions' });

    const results = [];
    for (const tx of txs || []) {
      let providerOk = false;
      try {
        const pixpay = require('./pixpay');
        if (typeof pixpay.checkTransactionStatus === 'function') {
          const check = await pixpay.checkTransactionStatus(tx.transaction_id);
          if (check && check.success && (check.state === 'SUCCESS' || check.state === 'SUCCESSFUL' || check.state === 'COMPLETED')) {
            providerOk = true;
          }
        }
      } catch (e) {
        // provider check not available
      }

      if (providerOk || forceConfirm) {
        const { error: updErr } = await supabase.from('payment_transactions').update({ status: 'SUCCESSFUL', updated_at: new Date().toISOString(), provider_response: JSON.stringify({ reconciled: true, reconciler: req.user?.id || 'admin', timestamp: new Date().toISOString() }) }).eq('id', tx.id);
        if (updErr) {
          results.push({ tx: tx.id, ok: false, error: updErr });
        } else {
          results.push({ tx: tx.id, ok: true });
        }
      } else {
        results.push({ tx: tx.id, ok: false, reason: 'not confirmed' });
      }
    }

    res.json({ results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed' });
  }
});

// ==========================================
// ENDPOINTS OTP (Direct7Networks)
// ==========================================

// Envoyer un code OTP
app.post('/api/otp/send', async (req, res) => {
  try {
    const { phone, allowExisting } = req.body || {};

    if (!phone) {
      return res.status(400).json({ success: false, error: 'Numéro de téléphone requis' });
    }

    // Formater le numéro
    let formattedPhone = phone.replace(/[\s\-\(\)]/g, '');
    if (!formattedPhone.startsWith('+')) {
      if (formattedPhone.startsWith('221')) {
        formattedPhone = '+' + formattedPhone;
      } else if (formattedPhone.startsWith('0')) {
        formattedPhone = '+221' + formattedPhone.substring(1);
      } else {
        formattedPhone = '+221' + formattedPhone;
      }
    }

    // Valider le format sénégalais
    if (!formattedPhone.match(/^\+221[0-9]{9}$/)) {
      return res.status(400).json({ success: false, error: 'Numéro sénégalais invalide' });
    }

    console.log(`[OTP] Demande d'envoi pour: ${formattedPhone} (allowExisting: ${!!allowExisting})`);

    // Protection serveur : empêcher l'envoi d'OTP si un profil existe déjà pour ce numéro
    try {
      const digitsOnly = formattedPhone.replace(/\D/g, '');
      const last9 = digitsOnly.slice(-9);
      const { data: existingProfiles, error: searchError } = await supabase
        .from('profiles')
        .select('id, phone, full_name, role')
        .ilike('phone', `%${last9}%`)
        .limit(1);

      if (searchError) {
        console.error('[OTP] Erreur recherche profil existant:', searchError);
      }

      if (existingProfiles && existingProfiles.length > 0 && !allowExisting) {
        console.log(`[OTP] Envoi bloqué pour ${formattedPhone} : profil existant ${existingProfiles[0].id}`);
        return res.status(409).json({
          success: false,
          error: 'Un compte existe déjà pour ce numéro, utilisez la connexion PIN',
          code: 'PROFILE_EXISTS',
          profile: existingProfiles[0]
        });
      }
    } catch (err) {
      console.error('[OTP] Erreur durant la vérification de profil avant envoi OTP:', err);
      // On continue si la vérification plante (par prudence) — on ne veut pas bloquer tous les envois par erreur serveur.
    }

    await sendOTP(formattedPhone);

    res.json({ success: true, message: 'Code envoyé', phone: formattedPhone });
  } catch (error) {
    console.error('[OTP] Erreur envoi:', error);
    const message = (error && error.message) ? String(error.message) : 'Erreur lors de l\'envoi du code';
    // Erreurs du fournisseur SMS (Direct7)
    if (message.includes('IP_NOT_WHITELISTED')) {
      return res.status(502).json({
        success: false,
        error: "Service SMS indisponible: IP du serveur non autorisée (IP_NOT_WHITELISTED).",
        code: 'IP_NOT_WHITELISTED'
      });
    }
    if (message.includes('DIRECT7_API_KEY')) {
      return res.status(500).json({
        success: false,
        error: 'Configuration SMS manquante côté serveur.',
        code: 'SMS_CONFIG_MISSING'
      });
    }
    res.status(500).json({ success: false, error: message });
  }
});

// Vérifier un code OTP
app.post('/api/otp/verify', async (req, res) => {
  try {
    const { phone, code } = req.body;

    if (!phone || !code) {
      return res.status(400).json({ success: false, error: 'Numéro et code requis' });
    }

    // Formater le numéro
    let formattedPhone = phone.replace(/[\s\-\(\)]/g, '');
    if (!formattedPhone.startsWith('+')) {
      if (formattedPhone.startsWith('221')) {
        formattedPhone = '+' + formattedPhone;
      } else {
        formattedPhone = '+221' + formattedPhone;
      }
    }

    console.log(`[OTP] Vérification pour: ${formattedPhone}, code: ${code}`);

    const result = await verifyOTP(formattedPhone, code);

    // New endpoint support: /api/auth/reset-pin will re-call verifyOTP server-side; no changes here
    

// Génération de JWT pour vendeur SMS après login (à appeler côté frontend après login PIN ou OTP validé)
app.post('/api/vendor/generate-jwt', async (req, res) => {
  try {
    const { vendor_id, phone } = req.body;
    if (!vendor_id || !phone) {
      return res.status(400).json({ success: false, error: 'vendor_id et phone requis' });
    }
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'votre-secret-très-long-et-sécurisé-changez-le';
    const payload = {
      sub: vendor_id,
      phone: phone,
      auth_mode: 'sms',
      role: 'vendor',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600 // 1h
    };
    const token = jwt.sign(payload, JWT_SECRET);
    console.log('[DEBUG] /api/vendor/generate-jwt created token for vendor_id:', vendor_id, 'tokenSnippet:', token.slice(0, 40));
    res.json({ success: true, token });
  } catch (err) {
    console.error('[API] /api/vendor/generate-jwt error:', err);
    res.status(500).json({ success: false, error: 'Erreur génération JWT' });
  }
});

    if (result.valid) {
      res.json({ success: true, valid: true });
    } else {
      res.status(400).json({ success: false, valid: false, error: result.error });
    }
  } catch (error) {
    console.error('[OTP] Erreur vérification:', error);
    const message = (error && error.message) ? String(error.message) : 'Erreur lors de la vérification du code';
    res.status(500).json({ success: false, error: message });
  }
});

// ==========================================
// ENDPOINTS SMS AUTH (création profil)
// ==========================================

// Créer un compte "virtuel" (Auth user + profile) pour la connexion SMS.
// Objectif: avoir un id présent dans auth.users pour satisfaire la FK profiles.id -> users.id.
app.post('/api/sms/register', async (req, res) => {
  try {
    const { full_name, phone, role, company_name, vehicle_info, wallet_type, pin } = req.body || {};

    if (!full_name || !phone || !role || !pin) {
      return res.status(400).json({ success: false, error: 'Champs requis manquants' });
    }

    // Formater le numéro (même logique que OTP)
    let formattedPhone = String(phone).replace(/[\s\-\(\)]/g, '');
    if (!formattedPhone.startsWith('+')) {
      if (formattedPhone.startsWith('221')) {
        formattedPhone = '+' + formattedPhone;
      } else if (formattedPhone.startsWith('0')) {
        formattedPhone = '+221' + formattedPhone.substring(1);
      } else {
        formattedPhone = '+221' + formattedPhone;
      }
    }
    if (!formattedPhone.match(/^\+221[0-9]{9}$/)) {
      return res.status(400).json({ success: false, error: 'Numéro sénégalais invalide' });
    }

    const safeRole = String(role);
    if (!['buyer', 'vendor', 'delivery'].includes(safeRole)) {
      return res.status(400).json({ success: false, error: 'Rôle invalide' });
    }

    // Empêcher doublons: si un profil existe déjà pour ce téléphone, retourner 409.
    // Utiliser une recherche tolérante sur les 9 derniers chiffres pour gérer différents formats
    const digitsOnly = formattedPhone.replace(/\D/g, '');
    const last9 = digitsOnly.slice(-9);
    console.log('[SMS] Vérification doublon pour phone:', formattedPhone, 'last9:', last9);

    const { data: existing, error: existingError } = await supabase
      .from('profiles')
      .select('id, phone')
      .ilike('phone', `%${last9}%`)
      .limit(1);

    if (existingError) {
      console.error('[SMS] Erreur recherche profil existant:', existingError);
      return res.status(500).json({ success: false, error: 'Erreur serveur (vérification profil)' });
    }
    if (existing && existing.length > 0) {
      return res.status(409).json({ success: false, error: 'Un compte existe déjà pour ce numéro' });
    }

    // Créer un user Supabase Auth (admin) avec email "virtuel".
    const virtualEmail = `${formattedPhone.replace('+', '')}@sms.validele.app`;
    
    // Vérifier si un utilisateur avec cet email virtuel existe déjà
    const { data: existingUsers, error: userListError } = await supabase.auth.admin.listUsers();
    if (userListError) {
      console.error('[SMS] Erreur listage utilisateurs:', userListError);
      return res.status(500).json({ success: false, error: 'Erreur serveur (vérification utilisateur)' });
    }
    
    const existingUser = existingUsers.users.find(u => u.email === virtualEmail);
    if (existingUser) {
      console.log('[SMS] Utilisateur existe déjà avec email virtuel:', virtualEmail);
      return res.status(409).json({ success: false, error: 'Un compte existe déjà pour ce numéro' });
    }

    const randomPassword = `Sms#${Math.random().toString(36).slice(2)}${Date.now()}`;

    const { data: created, error: createUserError } = await supabase.auth.admin.createUser({
      email: virtualEmail,
      password: randomPassword,
      email_confirm: true,
      user_metadata: {
        full_name,
        phone: formattedPhone,
        role: safeRole,
        auth_mode: 'sms'
      }
    });

    if (createUserError || !created?.user?.id) {
      console.error('[SMS] Erreur création user:', createUserError);
      
      // Si l'erreur est "email exists", cela signifie qu'il y a une incohérence
      if (createUserError?.code === 'email_exists') {
        return res.status(409).json({ success: false, error: 'Un compte existe déjà pour ce numéro' });
      }
      
      return res.status(500).json({ success: false, error: 'Erreur serveur (création utilisateur)' });
    }

    const userId = created.user.id;

    // Hasher le PIN avant de le stocker
    let hashedPin;
    try {
      const bcrypt = require('bcryptjs');
      hashedPin = await bcrypt.hash(String(pin), 10);
    } catch (err) {
      console.error('[SMS] Erreur hashage PIN:', err);
      return res.status(500).json({ success: false, error: 'Erreur serveur (hashage PIN)' });
    }

    // Créer le profil (id = userId) pour satisfaire la FK
    // Utiliser upsert pour éviter les erreurs de doublon
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        full_name,
        phone: formattedPhone,
        role: safeRole,
        company_name: safeRole === 'vendor' ? (company_name || null) : null,
        vehicle_info: safeRole === 'delivery' ? (vehicle_info || null) : null,
        wallet_type: safeRole === 'vendor' ? (wallet_type || null) : null,
        pin_hash: hashedPin
      }, { onConflict: 'id' });

    if (profileError) {
      console.error('[SMS] Erreur création profile:', profileError);
      // Best-effort cleanup: supprimer le user créé si le profil échoue
      try {
        await supabase.auth.admin.deleteUser(userId);
      } catch (cleanupErr) {
        console.error('[SMS] Erreur suppression user après échec profil:', cleanupErr);
      }
      return res.status(500).json({ success: false, error: 'Erreur lors de la création du profil' });
    }

    // Générer un token JWT pour l'utilisateur SMS
    const token = jwt.sign(
      {
        sub: userId,
        phone: formattedPhone,
        role: safeRole,
        auth_mode: 'sms'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      profileId: userId,
      phone: formattedPhone,
      role: safeRole,
      fullName: full_name,
      token,
      expiresIn: 7 * 24 * 60 * 60
    });
  } catch (error) {
    console.error('[SMS] Erreur register:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// ENDPOINTS PIXPAY (ORANGE MONEY)
// ==========================================

// Initier un paiement (collecte)
app.post('/api/payment/pixpay/initiate', async (req, res) => {
  try {
    const { amount, phone, orderId, customData } = req.body;

    if (!amount || !phone || !orderId) {
      return res.status(400).json({
        success: false,
        error: 'Paramètres manquants: amount, phone, orderId requis'
      });
    }

    console.log('[PIXPAY] Initiation paiement Orange Money:', { amount, phone, orderId });

    const result = await pixpayInitiate({
      amount,
      phone,
      orderId,
      customData
    });

    // Sauvegarder la transaction dans Supabase
    if (result.success && result.transaction_id) {
      const { error: dbError } = await supabase
        .from('payment_transactions')
        .insert({
          transaction_id: result.transaction_id,
          provider: 'pixpay',
          provider_transaction_id: result.provider_id,
          order_id: orderId,
          amount,
          phone,
          status: result.state || 'PENDING1',
          raw_response: normalizeJsonField(result.raw)
        });

      if (dbError) {
        console.error('[PIXPAY] Erreur sauvegarde DB:', dbError);
      }
    }

    return res.json({
      success: result.success,
      transaction_id: result.transaction_id,
      provider_id: result.provider_id,
      message: result.message,
      sms_link: result.sms_link,
      amount: result.amount,
      fee: result.fee
    });

  } catch (error) {
    console.error('[PIXPAY] Erreur initiate:', error);

    const pixpayMessage = error?.message || error?.raw?.message || (error?.raw?.data && error.raw.data.message) || 'Erreur lors de l\'initiation du paiement';
    const pixpayStatus = error?.status || (error?.raw?.statut_code ? error.raw.statut_code : 500);

    const responseBody = {
      success: false,
      error: pixpayMessage
    };
    if (process.env.DEBUG_PIXPAY === 'true') {
      responseBody.pixpay = error?.raw || error;
    }

    return res.status(pixpayStatus >= 400 && pixpayStatus < 600 ? pixpayStatus : 500).json(responseBody);
  }
});

// Endpoint PixPay Wave
app.post('/api/payment/pixpay-wave/initiate', async (req, res) => {
  try {
    const { amount, phone, orderId, customData } = req.body;

    if (!amount || !phone || !orderId) {
      return res.status(400).json({
        success: false,
        error: 'Paramètres manquants: amount, phone, orderId requis'
      });
    }

    console.log('[PIXPAY-WAVE] Initiation paiement Wave:', { amount, phone, orderId });

    const result = await pixpayWaveInitiate({
      amount,
      phone,
      orderId,
      customData
    });

    // Sauvegarder la transaction dans Supabase
    if (result.success && result.transaction_id) {
      const { error: dbError } = await supabase
        .from('payment_transactions')
        .insert({
          transaction_id: result.transaction_id,
          provider: 'pixpay_wave',
          provider_transaction_id: result.provider_id,
          order_id: orderId,
          amount,
          phone,
          status: result.state || 'PENDING1',
          raw_response: normalizeJsonField(result.raw)
        });

      if (dbError) {
        console.error('[PIXPAY-WAVE] Erreur sauvegarde DB:', dbError);
      }
    }

    return res.json({
      success: result.success,
      transaction_id: result.transaction_id,
      provider_id: result.provider_id,
      message: result.message,
      sms_link: result.sms_link,  // IMPORTANT: retourner le lien Wave
      amount: result.amount,
      fee: result.fee
    });

  } catch (error) {
    console.error('[PIXPAY-WAVE] Erreur initiate:', error);

    const pixpayMessage = error?.message || error?.raw?.message || (error?.raw?.data && error.raw.data.message) || 'Erreur lors de l\'initiation du paiement Wave';
    const pixpayStatus = error?.status || (error?.raw?.statut_code ? error.raw.statut_code : 500);

    const responseBody = {
      success: false,
      error: pixpayMessage
    };
    if (process.env.DEBUG_PIXPAY === 'true') {
      responseBody.pixpay = error?.raw || error;
    }

    return res.status(pixpayStatus >= 400 && pixpayStatus < 600 ? pixpayStatus : 500).json(responseBody);
  }
});

// Webhook IPN PixPay
app.post('/api/payment/pixpay-webhook', async (req, res) => {
  try {
    const ipnData = req.body;

    console.log('[PIXPAY-WEBHOOK] 🔔 IPN reçu à', new Date().toISOString());
    console.log('[PIXPAY-WEBHOOK] Headers:', JSON.stringify(req.headers, null, 2));
    console.log('[PIXPAY-WEBHOOK] Body:', JSON.stringify(ipnData, null, 2));

    const {
      transaction_id,
      state,
      response,
      error,
      custom_data,
      amount,
      destination,
      provider_id
    } = ipnData;

    if (!transaction_id) {
      console.error('[PIXPAY-WEBHOOK] ❌ Pas de transaction_id');
      return res.status(400).json({ error: 'Missing transaction_id' });
    }

    if (!state) {
      console.error('[PIXPAY-WEBHOOK] ❌ Pas de state');
      return res.status(400).json({ error: 'Missing state' });
    }

    // Parser custom_data
    let customData = {};
    try {
      customData = JSON.parse(custom_data || '{}');
    } catch (e) {
      console.warn('[PIXPAY-WEBHOOK] ⚠️ custom_data non JSON:', custom_data);
    }

    const orderId = customData.order_id;
    const transactionType = customData.type || 'payment'; // 'payment' ou 'payout'
    console.log('[PIXPAY-WEBHOOK] 📦 Order ID:', orderId, '| State:', state, '| Type:', transactionType);

    // Mettre à jour la transaction dans Supabase
    if (transaction_id) {
      try {
          const { error: updateError } = await supabase
            .from('payment_transactions')
            .update({
              status: state,
              provider_response: normalizeJsonField(response),
              provider_error: error || null,
              provider_transaction_id: provider_id || null,
              updated_at: new Date().toISOString()
            })
            .eq('transaction_id', transaction_id);

          if (updateError) {
            console.error('[PIXPAY] Erreur update DB:', updateError);
          }
      } catch (e) {
        console.error('[PIXPAY] defensive DB update failed (missing columns?), continue processing:', e?.message || e);
      }
    }

    // Si paiement réussi, mettre à jour la commande
    // IMPORTANT: Ne mettre à jour le status que pour les paiements initiaux, PAS pour les payouts
    if (state === 'SUCCESSFUL' && orderId && transactionType !== 'payout' && transactionType !== 'vendor_payout') {
      // Récupérer l'order_code de la commande
      const { data: orderData } = await supabase
        .from('orders')
        .select('order_code, status')
        .eq('id', orderId)
        .single();

      // Ne pas écraser le status si la commande est déjà delivered
      if (orderData?.status === 'delivered') {
        console.log('[PIXPAY] ⚠️ Commande déjà livrée, status non modifié');
      } else {
        const { error: orderError } = await supabase
          .from('orders')
          .update({
            status: 'paid', // Utiliser 'status' pas 'payment_status'
            payment_confirmed_at: new Date().toISOString(),
            qr_code: orderData?.order_code || null // Utiliser order_code comme QR code
          })
          .eq('id', orderId);

        if (orderError) {
          console.error('[PIXPAY] Erreur update order:', orderError);
        } else {
          console.log('[PIXPAY] ✅ Commande', orderId, 'marquée comme payée avec QR code:', orderData?.order_code);
        }
      }
    } else if (state === 'SUCCESSFUL' && (transactionType === 'payout' || transactionType === 'vendor_payout')) {
      console.log('[PIXPAY] ✅ Payout SUCCESSFUL', { transaction_id, transactionType, orderId });
      try {
        // If orderId corresponds to an order -> mark that order as paid
        if (orderId) {
          // Check if orderId is an actual order
          const { data: orderExists } = await supabase.from('orders').select('id').eq('id', orderId).maybeSingle();
          if (orderExists && orderExists.id) {
            await supabase.from('orders').update({ payout_status: 'paid', payout_paid_at: new Date().toISOString() }).eq('id', orderId);
            console.log('[PIXPAY] Order payout marked paid:', orderId);
          } else {
            // Otherwise treat orderId as a batch id
            const { data: items } = await supabase.from('payout_batch_items').select('id, order_id').eq('batch_id', orderId);
            if (items && items.length > 0) {
              const itemIds = items.map(i => i.id);
              const orderIds = items.map(i => i.order_id).filter(Boolean);
              await supabase.from('payout_batch_items').update({ status: 'paid' }).in('id', itemIds);
              if (orderIds.length > 0) await supabase.from('orders').update({ payout_status: 'paid', payout_paid_at: new Date().toISOString() }).in('id', orderIds);
              await supabase.from('payout_batches').update({ status: 'completed', processed_at: new Date().toISOString() }).eq('id', orderId);
              console.log('[PIXPAY] Batch payout completed for batch:', orderId);
            } else {
              console.log('[PIXPAY] Payout SUCCESSFUL but no order or batch found for id:', orderId);
            }
          }
        }
      } catch (e) {
        console.error('[PIXPAY] Error finalizing payout on webhook:', e);
      }
    }

    // Si échec, notifier l'acheteur et l'admin mais NE PAS changer le status de la commande
    if (state === 'FAILED' && orderId) {
      console.error('[PIXPAY] ❌ Paiement échoué:', {
        transaction_id,
        orderId,
        error
      });

      try {
        // Récupérer infos commande pour notifier l'acheteur
        const { data: orderInfo, error: orderInfoErr } = await supabase
          .from('orders')
          .select('id, order_code, buyer_id')
          .eq('id', orderId)
          .maybeSingle();

        if (orderInfoErr) {
          console.error('[PIXPAY] Erreur récupération commande pour notification:', orderInfoErr);
        }

        if (orderInfo && orderInfo.buyer_id) {
          try {
            await notificationService.notifyBuyerPaymentFailed(orderInfo.buyer_id, {
              orderId: orderInfo.id,
              orderCode: orderInfo.order_code
            });
          } catch (notifErr) {
            console.error('[PIXPAY] Erreur notification paiement échoué:', notifErr);
          }
        } else {
          console.log('[PIXPAY] Aucun acheteur trouvé pour la commande, notification ignorée');
        }

      } catch (e) {
        console.error('[PIXPAY] Erreur gestion échec paiement:', e);
      }
    }

    // Répondre à PixPay
    return res.json({ success: true, received: true });

  } catch (error) {
    console.error('[PIXPAY] Erreur webhook:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Envoyer de l'argent (payout vendeur(se)/livreur) - PROTÉGÉ : nécessite un admin
app.post('/api/payment/pixpay/payout', requireAdmin, async (req, res) => {
  try {
    const { amount, phone, orderId, type, walletType } = req.body;

    if (!amount || !phone || !orderId) {
      return res.status(400).json({
        success: false,
        error: 'Paramètres manquants: amount, phone, orderId requis'
      });
    }

    if (!walletType) {
      return res.status(400).json({
        success: false,
        error: 'walletType requis (wave-senegal ou orange-senegal)'
      });
    }

    console.log('[PIXPAY] Payout:', { amount, phone, orderId, type, walletType });

    const result = await pixpaySendMoney({
      amount,
      phone,
      orderId,
      type: type || 'payout',
      walletType
    });

    // Sauvegarder dans DB
    if (result.success && result.transaction_id) {
      const { error: dbError } = await supabase
        .from('payment_transactions')
        .insert({
          transaction_id: result.transaction_id,
          provider: 'pixpay',
          order_id: orderId,
          amount,
          phone,
          status: result.state || 'PENDING1',
          transaction_type: 'payout',
          raw_response: normalizeJsonField(result.raw)
        });

      if (dbError) {
        console.error('[PIXPAY] Erreur sauvegarde payout:', dbError);
      }
    }

    return res.json({
      success: result.success,
      transaction_id: result.transaction_id,
      message: result.message
    });

  } catch (error) {
    console.error('[PIXPAY] Erreur payout:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erreur lors de l\'envoi d\'argent'
    });
  }
});

// ===== Admin endpoints =====

// Generate/verify a simple HMAC-signed admin token (short-lived) using ADMIN_JWT_SECRET
function generateAdminToken(userId) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + (parseInt(process.env.ADMIN_TOKEN_TTL || '3600', 10));
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp })).toString('base64url');
  const secret = process.env.ADMIN_JWT_SECRET || 'dev_admin_secret_change_me';
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function verifyAdminToken(token) {
  try {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const secret = process.env.ADMIN_JWT_SECRET || 'dev_admin_secret_change_me';
    const expected = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    if (expected !== signature) return null;
    const obj = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    if (!obj.exp || !obj.sub) return null;
    if (Math.floor(Date.now() / 1000) > obj.exp) return null;
    return { id: obj.sub, exp: obj.exp };
  } catch (err) {
    console.error('[ADMIN] verifyAdminToken error:', err);
    return null;
  }
}

// Middleware: require admin user by SUPABASE access token, local admin token, or admin_users table
async function requireAdmin(req, res, next) {
  try {
    const adminUserId = process.env.ADMIN_USER_ID;

    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    let token = null;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && (req.cookies.admin_access || req.cookies.admin_token)) {
      // Accept admin access token from httpOnly cookie set by /api/admin/login
      token = req.cookies.admin_access || req.cookies.admin_token;
    }
    if (!token) {
      return res.status(401).json({ success: false, error: 'Missing Authorization token or admin cookie' });
    }

    // 1) Supabase token (preferred)
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data?.user) {
        // Log detected user id for debugging
        console.log('[ADMIN] requireAdmin: detected supabase user id ->', data.user.id);

        if (adminUserId && data.user.id === adminUserId) {
          req.adminUser = data.user;
          return next();
        }

        // Also accept users who have role='admin' in profiles table
        try {
          const { data: profRow, error: profErr } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
          if (!profErr && profRow && profRow.role === 'admin') {
            console.log('[ADMIN] requireAdmin: profile role=admin, granting access for', data.user.id);
            req.adminUser = data.user;
            return next();
          }
        } catch (e) {
          console.warn('[ADMIN] requireAdmin: error checking profile role:', e?.message || e);
        }

        // Check admin_users
        const { data: adminRow, error: adminErr } = await supabase
          .from('admin_users')
          .select('id')
          .eq('id', data.user.id)
          .maybeSingle();
        if (adminErr) {
          console.error('[ADMIN] Error checking admin_users:', adminErr);
          return res.status(500).json({ success: false, error: 'Server error checking admin users' });
        }
        console.log('[ADMIN] requireAdmin: admin_users lookup result ->', adminRow);
        if (adminRow && adminRow.id) {
          req.adminUser = data.user;
          return next();
        }
        console.warn('[ADMIN] Unauthorized user:', data.user.id);
        return res.status(403).json({ success: false, error: 'Forbidden: admin access required' });
      }
    } catch (e) {
      // ignore and try local token
    }

    // 2) Local admin token (issued by /api/admin/login-local)
    const verified = verifyAdminToken(token);
    if (verified && verified.id) {
      if (adminUserId && verified.id === adminUserId) {
        req.adminUser = { id: verified.id };
        return next();
      }
      const { data: row, error: rowErr } = await supabase
        .from('admin_users')
        .select('id')
        .eq('id', verified.id)
        .maybeSingle();
      if (rowErr) {
        console.error('[ADMIN] Error checking admin_users for local token:', rowErr);
        return res.status(500).json({ success: false, error: 'Server error checking admin users' });
      }
      if (row && row.id) {
        req.adminUser = { id: verified.id };
        return next();
      }
    }

    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  } catch (err) {
    console.error('[ADMIN] requireAdmin error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// POST /api/admin/login - authenticate admin via email/password and set httpOnly cookies
app.post('/api/admin/login', async (req, res) => {
  try {
    // Robust parsing: accept well-formed JSON, and fall back to tolerant parsing
    // for common malformed bodies (PowerShell single-quoted JSON, urlencoded payloads, etc.).
    let { email, password } = req.body || {};

    if ((!email || !password) && req.rawBody) {
      const raw = String(req.rawBody || '').trim();
      // Remove wrapping single quotes often added by shells: e.g. '\'{...}\''
      let normalized = raw.replace(/^'+/, '').replace(/'+$/, '');
      let parsed = null;

      try {
        parsed = JSON.parse(normalized);
      } catch (jsonErr1) {
        // Try converting simple single quotes to double quotes (best-effort)
        try {
          parsed = JSON.parse(normalized.replace(/'/g, '"'));
        } catch (jsonErr2) {
          // Try parsing as urlencoded form
          try {
            const qs = require('querystring');
            parsed = qs.parse(normalized);
          } catch (qsErr) {
            parsed = null;
          }
        }
      }

      if (parsed) {
        // Mask password in logs
        const snippet = (typeof normalized === 'string' ? normalized.replace(/("password"\s*:\s*)"([^"]+)"/gi, '$1"***"').replace(/('password'\s*:\s*)'([^']+)'/gi, "$1'***'") : '');
        console.log('[ADMIN] tolerant-parse login body, snippet:', snippet.slice(0, 200));
        email = email || parsed.email;
        password = password || parsed.password;
      }
    }

    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error('[ADMIN] Supabase auth config missing. SUPABASE_URL present?', !!SUPABASE_URL, 'anonKeySource:', SUPABASE_ANON_KEY_SOURCE);
      return res.status(500).json({ success: false, error: 'Server config error' });
    }

    // Use Supabase JS SDK for authentication to avoid edge-cases with direct token endpoint parsing
    const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({ email: String(email), password: String(password) });
    if (loginErr || !loginData?.session?.access_token) {
      console.error('[ADMIN] login error:', loginErr || 'no session returned');
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const accessToken = loginData.session.access_token;
    const refreshToken = loginData.session.refresh_token;
    const expiresIn = Number(loginData.session.expires_in || process.env.ADMIN_TOKEN_TTL || 3600);


    // Vérification stricte du rôle admin dans profiles
    const { data: userRes } = await supabase.auth.getUser(accessToken);
    const user = userRes?.user;
    if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    // Vérifier que le profil a bien role = 'admin'
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profileErr) {
      console.error('[ADMIN] Error checking profile role:', profileErr);
      return res.status(500).json({ success: false, error: 'Server error checking profile' });
    }
    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Forbidden: admin access required' });
    }

    // Set httpOnly cookies
    // Pour permettre l'auth cross-site (localhost <-> Render), il faut SameSite=None et Secure
    res.cookie('admin_access', accessToken, { httpOnly: true, secure: true, sameSite: 'none', maxAge: expiresIn * 1000 });
    if (refreshToken) res.cookie('admin_refresh', refreshToken, { httpOnly: true, secure: true, sameSite: 'none', path: '/api/admin/refresh' });

    // Return session tokens so the frontend can initialize the Supabase client session
    return res.json({ success: true, access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn, user_id: user.id });
  } catch (err) {
    console.error('[ADMIN] login error:', err?.response?.data || err?.message || err);
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

// POST /api/admin/refresh - rotate refresh token and set new cookies
app.post('/api/admin/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.admin_refresh || req.body?.refresh_token;
    if (!refreshToken) return res.status(400).json({ success: false, error: 'Missing refresh token' });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error('[ADMIN] Supabase auth config missing. SUPABASE_URL present?', !!SUPABASE_URL, 'anonKeySource:', SUPABASE_ANON_KEY_SOURCE);
      return res.status(500).json({ success: false, error: 'Server config error' });
    }
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);

    const r = await axios.post(`${SUPABASE_URL}/auth/v1/token`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', apikey: SUPABASE_ANON_KEY }
    });

    const data = r.data || {};
    const accessToken = data.access_token;
    const newRefresh = data.refresh_token;
    const expiresIn = Number(data.expires_in || process.env.ADMIN_TOKEN_TTL || 3600);

    if (!accessToken) return res.status(401).json({ success: false, error: 'Invalid refresh token' });

    // Verify admin status
    const { data: userRes } = await supabase.auth.getUser(accessToken);
    const user = userRes?.user;
    if (!user) return res.status(401).json({ success: false, error: 'Invalid session' });
    const adminIdEnv = process.env.ADMIN_USER_ID;
    if (adminIdEnv && user.id !== adminIdEnv) {
      const { data: adminRow } = await supabase.from('admin_users').select('id').eq('id', user.id).maybeSingle();
      if (!adminRow || !adminRow.id) return res.status(403).json({ success: false, error: 'Forbidden: admin access required' });
    }

    // Use SameSite=None; Secure to allow cross-site usage (frontend on localhost)
    res.cookie('admin_access', accessToken, { httpOnly: true, secure: true, sameSite: 'none', maxAge: expiresIn * 1000 });
    if (newRefresh) res.cookie('admin_refresh', newRefresh, { httpOnly: true, secure: true, sameSite: 'none', path: '/api/admin/refresh' });

    // Also return tokens so frontend can initialize supabase client session
    return res.json({ success: true, access_token: accessToken, refresh_token: newRefresh, expires_in: expiresIn, user_id: user.id });
  } catch (err) {
    console.error('[ADMIN] refresh error:', err?.response?.data || err?.message || err);
    return res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }
});

// POST /api/admin/logout - clear admin cookies
app.post('/api/admin/logout', async (req, res) => {
  res.clearCookie('admin_access', { path: '/' });
  res.clearCookie('admin_refresh', { path: '/api/admin/refresh' });
  return res.json({ success: true });
});

// GET /api/admin/validate - validate current admin session (cookie)
app.get('/api/admin/validate', async (req, res) => {
  try {
    const token = req.cookies?.admin_access;
    if (!token) return res.status(401).json({ success: false, error: 'No admin session' });
    const { data: userRes } = await supabase.auth.getUser(token);
    const user = userRes?.user;
    if (!user) return res.status(401).json({ success: false, error: 'Invalid session' });
    const adminIdEnv = process.env.ADMIN_USER_ID;
    if (adminIdEnv && user.id !== adminIdEnv) {
      const { data: adminRow } = await supabase.from('admin_users').select('id').eq('id', user.id).maybeSingle();
      if (!adminRow || !adminRow.id) return res.status(403).json({ success: false, error: 'Forbidden: admin access required' });
    }
    return res.json({ success: true, user });
  } catch (err) {
    console.error('[ADMIN] validate error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/admin/login-local - exchange local PIN to a short-lived admin token
app.post('/api/admin/login-local', async (req, res) => {
  try {
    const { profileId, pin } = req.body || {};
    if (!profileId || !pin) return res.status(400).json({ success: false, error: 'profileId and pin required' });

    // Fetch profile
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, pin_hash, role')
      .eq('id', profileId)
      .maybeSingle();
    if (profileErr) {
      console.error('[ADMIN] Error fetching profile for local login:', profileErr);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
    if (!profile || !profile.id) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    // Disallow PIN login for admin role on admin login-local endpoint
    if (profile.role === 'admin') {
      console.warn('[ADMIN] PIN login attempt blocked for admin profile via login-local:', profileId);
      return res.status(403).json({ success: false, error: 'PIN login disabled for admin; please use email/password' });
    }

    // Verify PIN
    // Support both plaintext legacy pins and bcrypt-hashed pins (used by SMS registration)
    let isPinValid = false;
    try {
      const pinStored = String(profile.pin_hash || '');
      // bcrypt hash detection
      if (/^\$2[aby]\$/.test(pinStored)) {
        try {
          const bcrypt = require('bcryptjs');
          isPinValid = await bcrypt.compare(String(pin), pinStored);
        } catch (bcryptErr) {
          console.error('[ADMIN] bcrypt compare error during login-local:', bcryptErr);
          // fallback to plain equality
          isPinValid = String(pin) === pinStored;
        }
      } else {
        // Plaintext equality (legacy)
        isPinValid = String(pin) === pinStored;
        // If match and bcrypt available, migrate to bcrypt for safety
        if (isPinValid) {
          try {
            const bcrypt = require('bcryptjs');
            const newHash = await bcrypt.hash(String(pin), 10);
            await supabase.from('profiles').update({ pin_hash: newHash }).eq('id', profileId);
            console.log('[ADMIN] Migrated plain PIN to bcrypt for admin profile', profileId);
          } catch (migErr) {
            console.warn('[ADMIN] Failed to migrate plain PIN to bcrypt:', migErr);
          }
        }
      }
    } catch (verifyErr) {
      console.error('[ADMIN] Error verifying PIN:', verifyErr);
      return res.status(500).json({ success: false, error: 'Server error' });
    }

    if (!isPinValid) {
      return res.status(401).json({ success: false, error: 'Invalid PIN' });
    }

    // Check admin_users or ADMIN_USER_ID
    const adminUserId = process.env.ADMIN_USER_ID;
    if (adminUserId && profileId === adminUserId) {
      const token = generateAdminToken(profileId);
      return res.json({ success: true, token, expires_in: parseInt(process.env.ADMIN_TOKEN_TTL || '3600', 10) });
    }
    const { data: adminRow, error: adminErr } = await supabase
      .from('admin_users')
      .select('id')
      .eq('id', profileId)
      .maybeSingle();
    if (adminErr) {
      console.error('[ADMIN] Error checking admin_users for local login:', adminErr);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
    if (!adminRow || !adminRow.id) {
      return res.status(403).json({ success: false, error: 'Not an admin' });
    }

    const token = generateAdminToken(profileId);
    return res.json({ success: true, token, expires_in: Number(process.env.ADMIN_TOKEN_TTL || '3600') });
  } catch (err) {
    console.error('[ADMIN] login-local error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});


// Lister les commandes (admin)
app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  try {
    // Include buyer, vendor and (if present) delivery person details using FK relationship selects
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id, order_code, total_amount, status, vendor_id, buyer_id, delivery_person_id,
        payout_status, payout_requested_at, payout_requested_by,
        buyer:profiles!orders_buyer_id_fkey(id, full_name, phone, wallet_type),
        vendor:profiles!orders_vendor_id_fkey(id, full_name, phone, wallet_type),
        delivery:profiles!orders_delivery_person_id_fkey(id, full_name, phone)
      `)
      .order('created_at', { ascending: false });
    if (error) throw error;

    // Debug logs only when DEBUG environment variable is explicitly enabled
    if (process.env.DEBUG === 'true') {
      try {
        const count = Array.isArray(data) ? data.length : 0;
        console.log('[ADMIN] /api/admin/orders fetched count:', count);
        console.log('[ADMIN] /api/admin/orders sample rows:', JSON.stringify((data || []).slice(0, 10)));
      } catch (e) {
        console.warn('[ADMIN] /api/admin/orders debug log failed:', e?.message || e);
      }

      // Include debug info in the response when DEBUG environment flag is enabled
      const debugPayload = { count: Array.isArray(data) ? data.length : 0, sample: (data || []).slice(0,5) };
      return res.json(Object.assign({ success: true, orders: data }, { debug: debugPayload }));
    }

    // Normal response (no debug information)
    return res.json({ success: true, orders: data });
  } catch (error) {
    console.error('[ADMIN] Erreur list orders:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Lister les transactions (admin)
app.get('/api/admin/transactions', requireAdmin, async (req, res) => {
  try {
    if (process.env.DEBUG === 'true') console.log('[ADMIN] list transactions requested by:', req.adminUser?.id || 'unknown');

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.warn('[ADMIN] SUPABASE_SERVICE_ROLE_KEY not configured - falling back to RLS-bound client');
      const { data, error } = await supabase
        .from('payment_transactions')
        .select('*, order:orders(id, order_code), provider, status, transaction_type, provider_transaction_id, raw_response, provider_response, batch_id')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return res.json({ success: true, transactions: data, usingServiceRole: false });
    }

    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabaseAdmin = createClient(process.env.SUPABASE_URL, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

      const { data, error } = await supabaseAdmin
        .from('payment_transactions')
        .select('*, order:orders(id, order_code), provider, status, transaction_type, provider_transaction_id, raw_response, provider_response, batch_id')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('[ADMIN] admin client error fetching transactions:', error);
        return res.status(500).json({ success: false, error: error.message || 'Erreur DB' });
      }

      if (process.env.DEBUG === 'true') {
        console.log('[ADMIN] admin transactions count:', Array.isArray(data) ? data.length : 0);
      }

      return res.json({ success: true, transactions: data || [], usingServiceRole: true, timestamp: new Date().toISOString() });
    } catch (e) {
      console.error('[ADMIN] admin client failed to fetch transactions:', e);
      return res.status(500).json({ success: false, error: 'Server error querying as admin', details: String(e) });
    }
  } catch (error) {
    console.error('[ADMIN] Erreur list transactions:', error?.message || error, error?.stack || 'no stack');
    // Avoid leaking sensitive stacks unless DEBUG enabled
    const responseError = process.env.DEBUG === 'true' ? String(error) : 'Internal server error';
    res.status(500).json({ success: false, error: responseError });
  }
});

// Timers: list active timers
app.get('/api/admin/timers', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('admin_timers')
      .select('*, order:orders(id, order_code)')
      .eq('active', true)
      .order('started_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, timers: data });
  } catch (error) {
    console.error('[ADMIN] Erreur list timers:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Start a timer for an order
app.post('/api/admin/start-timer', requireAdmin, async (req, res) => {
  try {
    const { orderId, durationSeconds, message } = req.body || {};
    if (!orderId || !durationSeconds) return res.status(400).json({ success: false, error: 'orderId and durationSeconds required' });

    const startedBy = req.adminUser?.id || null;
    const { data, error } = await supabase
      .from('admin_timers')
      .insert({ order_id: orderId, duration_seconds: durationSeconds, started_by: startedBy, message })
      .select('*')
      .single();
    if (error) throw error;

    // Notify buyer and vendor if present
    try {
      const { data: orderInfo } = await supabase.from('orders').select('id, buyer_id, vendor_id, order_code').eq('id', orderId).maybeSingle();
      if (orderInfo) {
        if (orderInfo.buyer_id) await notificationService.sendPushNotificationToUser(orderInfo.buyer_id, '⏱️ Countdown démarré', message || 'Un compte à rebours a été démarré pour votre commande.');
        if (orderInfo.vendor_id) await notificationService.sendPushNotificationToUser(orderInfo.vendor_id, '⏱️ Countdown démarré', message || 'Un compte à rebours a été démarré pour une commande.');
      }
    } catch (notifyErr) {
      console.error('[ADMIN] failed to notify on timer start:', notifyErr);
    }

    res.json({ success: true, timer: data });
  } catch (error) {
    console.error('[ADMIN] start timer error:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Cancel timer
app.post('/api/admin/cancel-timer', requireAdmin, async (req, res) => {
  try {
    const { timerId } = req.body || {};
    if (!timerId) return res.status(400).json({ success: false, error: 'timerId required' });

    const { error } = await supabase.from('admin_timers').update({ active: false }).eq('id', timerId);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('[ADMIN] cancel timer error:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Send a custom notification to any user (admin action)
app.post('/api/admin/notify', requireAdmin, async (req, res) => {
  try {
    const { userId, title, body } = req.body || {};
    if (!userId || !title || !body) return res.status(400).json({ success: false, error: 'userId, title and body required' });

    // Defensive: ensure the notification function exists (helps avoid TypeError when module wasn't reloaded)
    const notifyFn = (notificationService && (notificationService.sendPushNotificationToUser || notificationService.sendPushNotification)) || null;
    if (!notifyFn || typeof notifyFn !== 'function') {
      console.error('[ADMIN] notify error: notification function not available', Object.keys(notificationService || {}));
      return res.status(500).json({ success: false, error: 'Notification service unavailable on server' });
    }

    const result = await notifyFn(userId, title, body, { sentByAdmin: true });
    res.json({ success: true, result });
  } catch (error) {
    console.error('[ADMIN] notify error:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Initiate payout for an order (admin)
app.post('/api/admin/payout-order', requireAdmin, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, error: 'orderId requis' });

    // Verify eligibility based only on order status/payout_status
    const report = await verifyOrderForPayout(orderId);
    if (!report.ok) return res.status(404).json({ success: false, error: report.error });
    if (!report.eligible) return res.status(400).json({ success: false, error: 'order_not_eligible', report });

    // Fetch vendor
    const { data: vendor, error: vendorErr } = await supabase
      .from('profiles')
      .select('id, phone, wallet_type')
      .eq('id', report.order.vendor_id)
      .single();

    if (vendorErr || !vendor) return res.status(404).json({ success: false, error: 'Vendeur non trouvé' });

    const walletType = vendor.wallet_type || 'wave-senegal';
    const phone = vendor.phone;

    if (!phone) return res.status(400).json({ success: false, error: 'Numéro vendeur non trouvé' });

    // Execute payout via PixPay
    const result = await pixpaySendMoney({ amount: report.order.total_amount, phone, orderId: report.order.id, type: 'vendor_payout', walletType });

    // Record transaction
    if (result && result.transaction_id) {
      const { error: txErr } = await supabase.from('payment_transactions').insert({
        transaction_id: result.transaction_id,
        provider: 'pixpay',
        order_id: report.order.id,
        amount: report.order.total_amount,
        phone,
        status: result.state || 'PENDING1',
        transaction_type: 'payout',
        raw_response: result.raw
      });
      if (txErr) console.error('[ADMIN] Erreur save payout tx:', txErr);

      // Mark order as processing (final paid will be set by webhook SUCCESSFUL)
      const { error: updErr } = await supabase.from('orders').update({ payout_status: 'processing', payout_processing_at: new Date().toISOString() }).eq('id', report.order.id);
      if (updErr) console.error('[ADMIN] Erreur mise à jour order payout_status:', updErr);
    }

    res.json({ success: result.success, result });
  } catch (error) {
    console.error('[ADMIN] Erreur payout-order:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Helper: verify order payout eligibility and return a detailed report
// NOTE: Per project rule, eligibility depends on order status, payout_status and that the buyer has paid.
async function verifyOrderForPayout(orderId) {
  if (!orderId) return { ok: false, error: 'order_id_required' };

  // Fetch order (include payment_confirmed_at)
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, order_code, status, total_amount, vendor_id, payout_status, payout_requested_at, payment_confirmed_at')
    .eq('id', orderId)
    .maybeSingle();

  if (orderErr || !order) return { ok: false, error: 'order_not_found' };

  // Checks: delivered implies buyer paid for our app flow; accept payment_confirmed_at, status='paid' or status='delivered' as paid
  const delivered = order.status === 'delivered';
  const paid = !!order.payment_confirmed_at || order.status === 'paid' || order.status === 'delivered';
  const payoutStatusOk = (order.payout_status === 'requested' || order.payout_status === 'scheduled');
  const alreadyPaid = order.payout_status === 'paid';

  // Vendor info required
  const { data: vendor } = await supabase
    .from('profiles')
    .select('id, full_name, phone, wallet_type')
    .eq('id', order.vendor_id)
    .maybeSingle();

  const vendorOk = vendor && vendor.phone;

  // Additional check: detect if a successful payout transaction already exists for this order
  try {
    // 1) direct transaction for this order
    const { data: txs } = await supabase.from('payment_transactions').select('id,transaction_id,status').eq('order_id', orderId).eq('status', 'SUCCESSFUL').limit(1);
    if (txs && txs.length > 0) {
      // There is a provider-confirmed payout for this order
      if (!alreadyPaid) {
        // Try to reconcile state in DB (best-effort)
        try {
          await supabase.from('orders').update({ payout_status: 'paid', payout_paid_at: new Date().toISOString() }).eq('id', orderId);
        } catch (e) {
          console.warn('[ADMIN] verifyOrderForPayout - failed to mark order paid:', e?.message || e);
        }
      }
      alreadyPaid = true;
    } else {
      // 2) check if order is part of a batch that has a successful payment transaction
      const { data: items } = await supabase.from('payout_batch_items').select('batch_id').eq('order_id', orderId);
      const batchIds = (items || []).map(i => i.batch_id).filter(Boolean);
      if (batchIds.length > 0) {
        const { data: txsBatch } = await supabase.from('payment_transactions').select('id,transaction_id,status').in('batch_id', batchIds).eq('status', 'SUCCESSFUL').limit(1);
        if (txsBatch && txsBatch.length > 0) {
          if (!alreadyPaid) {
            try {
              await supabase.from('orders').update({ payout_status: 'paid', payout_paid_at: new Date().toISOString() }).eq('id', orderId);
            } catch (e) {
              console.warn('[ADMIN] verifyOrderForPayout - failed to mark order paid (batch):', e?.message || e);
            }
          }
          alreadyPaid = true;
        }
      }
    }
  } catch (e) {
    console.warn('[ADMIN] verifyOrderForPayout - error checking existing payout txs:', e?.message || e);
    // Non-fatal
  }

  // Eligible only if delivered AND buyer paid AND payout status valid AND vendor info present and not already paid
  const eligible = delivered && paid && payoutStatusOk && !alreadyPaid && vendorOk;

  const reasons = [];
  if (!delivered) reasons.push('not_delivered');
  if (!paid) reasons.push('not_paid');
  if (!vendorOk) reasons.push('vendor_info_missing');
  if (!payoutStatusOk) reasons.push('invalid_payout_status');
  if (alreadyPaid) reasons.push('already_paid');

  return {
    ok: true,
    order,
    vendor: vendor || null,
    checks: {
      delivered,
      paid,
      payment_confirmed_at: order.payment_confirmed_at || null,
      payoutStatusOk,
      vendorOk,
      payout_status: order.payout_status || null,
      alreadyPaid
    },
    eligible,
    reasons
  };
}

// POST /api/admin/verify-and-payout - run a full verification and optionally execute the payout (admin only)
app.post('/api/admin/verify-and-payout', requireAdmin, async (req, res) => {
  try {
    const { orderId, execute } = req.body || {};
    if (!orderId) return res.status(400).json({ success: false, error: 'orderId required' });

    const report = await verifyOrderForPayout(orderId);
    if (!report.ok) return res.status(404).json({ success: false, error: report.error });

    // If just verifying, return the report
    if (!execute) return res.json({ success: true, report });

    // If executing, make sure eligible
    if (!report.eligible) return res.status(400).json({ success: false, error: 'order_not_eligible_for_payout', report });

    // Call PixPay to send money to vendor
    const amount = report.order.total_amount;
    const phone = report.vendor.phone;
    const walletType = report.vendor.wallet_type || 'wave-senegal';

    console.log('[ADMIN] verify-and-payout executing payout for order:', orderId, { amount, phone, walletType });

    const payoutRes = await pixpaySendMoney({ amount, phone, orderId: report.order.id, type: 'vendor_payout', walletType });

    if (payoutRes && payoutRes.transaction_id) {
      const { error: txErr } = await supabase.from('payment_transactions').insert({
        transaction_id: payoutRes.transaction_id,
        provider: 'pixpay',
        order_id: report.order.id,
        amount,
        phone,
        status: payoutRes.state || 'PENDING1',
        transaction_type: 'payout',
        raw_response: payoutRes.raw
      });
      if (txErr) console.error('[ADMIN] verify-and-payout - failed saving payout tx:', txErr);

      // mark order as processing; final 'paid' will be set by webhook when provider confirms
      const { error: updateErr } = await supabase.from('orders').update({ payout_status: 'processing', payout_processing_at: new Date().toISOString() }).eq('id', report.order.id);
      if (updateErr) console.error('[ADMIN] verify-and-payout - failed updating order payout_status:', updateErr);
    }

    return res.json({ success: true, payout: payoutRes });
  } catch (error) {
    console.error('[ADMIN] verify-and-payout error:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// ---------- Payout Batches (admin) ----------
// Create a payout batch from delivered orders with payout_status = 'requested'
app.post('/api/admin/payout-batches/create', requireAdmin, async (req, res) => {
  try {
    const { notes, scheduled_at, commission_pct } = req.body || {};
    const createdBy = req.adminUser?.id || null;

    // Prefer the service role client for admin operations to bypass RLS
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let supabaseAdmin = supabase;
    if (serviceRoleKey) {
      const { createClient } = require('@supabase/supabase-js');
      supabaseAdmin = createClient(process.env.SUPABASE_URL, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
      console.log('[ADMIN] create payout batch - using service role client');
    } else {
      console.warn('[ADMIN] create payout batch - SUPABASE_SERVICE_ROLE_KEY missing; falling back to RLS-bound client (may fail)');
    }

    const pct = typeof commission_pct === 'number' ? Number(commission_pct) : (commission_pct ? Number(commission_pct) : 0);
    if (isNaN(pct) || pct < 0) return res.status(400).json({ success: false, error: 'commission_pct must be a non-negative number' });

    // Fetch orders eligible for batching (delivered & requested). We accept delivered orders as paid per app workflow.
    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select('id, vendor_id, total_amount, payment_confirmed_at, status')
      .eq('status', 'delivered')
      .eq('payout_status', 'requested');

    if (error) {
      console.error('[ADMIN] create payout batch - fetch orders error:', error);
      throw error;
    }

    if (!orders || orders.length === 0) {
      return res.json({ success: true, message: 'No payout requests found' });
    }

    const totalAmount = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);

    // Insert batch (store commission_pct)
    const { data: batch, error: batchErr } = await supabaseAdmin
      .from('payout_batches')
      .insert({ created_by: createdBy, scheduled_at: scheduled_at || new Date().toISOString(), total_amount: totalAmount, notes, commission_pct: pct })
      .select('*')
      .single();

    if (batchErr || !batch) {
      console.error('[ADMIN] create payout batch - insert batch error:', batchErr);
      throw batchErr || new Error('Failed to create batch');
    }

    // Compute commission and net per item and insert items
    const items = orders.map(o => {
      const amount = Number(o.total_amount || 0);
      const commission_amount = Math.round(amount * pct / 100);
      const net_amount = amount - commission_amount;
      return { batch_id: batch.id, order_id: o.id, vendor_id: o.vendor_id, amount, commission_pct: pct, commission_amount, net_amount };
    });

    const { error: itemsErr } = await supabaseAdmin.from('payout_batch_items').insert(items);
    if (itemsErr) {
      console.error('[ADMIN] create payout batch - insert items error:', itemsErr);
      throw itemsErr;
    }

    // Mark orders as scheduled
    const orderIds = orders.map(o => o.id);
    const { error: updateOrdersErr } = await supabaseAdmin.from('orders').update({ payout_status: 'scheduled' }).in('id', orderIds);
    if (updateOrdersErr) {
      console.error('[ADMIN] create payout batch - updating orders error:', updateOrdersErr);
    }

    res.json({ success: true, batch });
  } catch (error) {
    console.error('[ADMIN] create payout batch error:', error);
    const msg = error?.message || (error && typeof error === 'object' ? JSON.stringify(error) : String(error));
    res.status(500).json({ success: false, error: msg });
  }
});

// List payout batches
app.get('/api/admin/payout-batches', requireAdmin, async (req, res) => {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.warn('[ADMIN] SUPABASE_SERVICE_ROLE_KEY not configured - falling back to RLS-bound client for payout batches');
      const { data: batches, error } = await supabase.from('payout_batches').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      const batchIds = (batches || []).map(b => b.id);
      const { data: items } = await supabase.from('payout_batch_items').select('*').in('batch_id', batchIds || []);
      return res.json({ success: true, batches, items: items || [], usingServiceRole: false });
    }

    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabaseAdmin = createClient(process.env.SUPABASE_URL, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

      const { data: batches, error: batchesErr } = await supabaseAdmin.from('payout_batches').select('*').order('created_at', { ascending: false }).limit(200);
      if (batchesErr) throw batchesErr;

      const batchIds = (batches || []).map(b => b.id);
      const { data: items, error: itemsErr } = await supabaseAdmin.from('payout_batch_items').select('*').in('batch_id', batchIds || []);
      if (itemsErr) {
        console.warn('[ADMIN] warning fetching payout_batch_items (admin):', itemsErr.message || itemsErr);
      }

      return res.json({ success: true, batches, items: items || [], usingServiceRole: true, timestamp: new Date().toISOString() });
    } catch (e) {
      console.error('[ADMIN] failed fetching payout batches as admin:', e);
      return res.status(500).json({ success: false, error: 'Server error fetching payout batches', details: String(e) });
    }
  } catch (error) {
    console.error('[ADMIN] list payout batches error:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Get details for a batch (items with order and vendor info)
app.get('/api/admin/payout-batches/:id/details', requireAdmin, async (req, res) => {
  try {
    const batchId = req.params.id;
    if (!batchId) return res.status(400).json({ success: false, error: 'batch id required' });

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.warn('[ADMIN] SUPABASE_SERVICE_ROLE_KEY not configured - falling back to RLS-bound client for batch details');
      const { data: batch, error: batchErr } = await supabase.from('payout_batches').select('*').eq('id', batchId).maybeSingle();
      if (batchErr) throw batchErr;
      if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });
      const { data: items, error: itemsErr } = await supabase.from('payout_batch_items').select('*, order:orders(id, order_code, total_amount), vendor:profiles(id, full_name, phone, wallet_type)').eq('batch_id', batchId).order('id', { ascending: true });
      if (itemsErr) throw itemsErr;
      return res.json({ success: true, batch, items: items || [], usingServiceRole: false });
    }

    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabaseAdmin = createClient(process.env.SUPABASE_URL, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

      const { data: batch, error: batchErr } = await supabaseAdmin.from('payout_batches').select('*').eq('id', batchId).maybeSingle();
      if (batchErr) throw batchErr;
      if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });

      const { data: items, error: itemsErr } = await supabaseAdmin.from('payout_batch_items').select('*, order:orders(id, order_code, total_amount), vendor:profiles(id, full_name, phone, wallet_type)').eq('batch_id', batchId).order('id', { ascending: true });
      if (itemsErr) throw itemsErr;

      return res.json({ success: true, batch, items: items || [], usingServiceRole: true, timestamp: new Date().toISOString() });
    } catch (e) {
      console.error('[ADMIN] failed fetching batch details as admin:', e);
      return res.status(500).json({ success: false, error: 'Server error fetching batch details', details: String(e) });
    }
  } catch (err) {
    console.error('[ADMIN] get batch details error:', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// Render a printable invoice HTML for a vendor within a batch
app.get('/api/admin/payout-batches/:id/invoice', requireAdmin, async (req, res) => {
  try {
    let batchId = req.params.id;
    const vendorId = req.query.vendorId || req.query.vendor_id || req.query.vendor;
    if (!batchId || !vendorId) return res.status(400).send('batch id and vendorId required');

    console.log('[ADMIN] invoice request for batch:', batchId, 'vendorId:', vendorId);

    // Prefer using the service role client for admin invoice queries (bypass RLS)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let db = supabase; // default (RLS-bound)
    if (serviceRoleKey) {
      try {
        const { createClient } = require('@supabase/supabase-js');
        db = createClient(process.env.SUPABASE_URL, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
        console.log('[ADMIN] invoice - using service role Supabase client for batch lookup');
      } catch (e) {
        console.warn('[ADMIN] invoice - failed to create service role client, falling back to current client:', e?.message || e);
      }
    } else {
      console.warn('[ADMIN] invoice - SUPABASE_SERVICE_ROLE_KEY missing; using RLS-bound client (may not see some batch rows)');
    }

    // Try to fetch the batch and vendor-specific items using the chosen client
    let { data: batch } = await db.from('payout_batches').select('*').eq('id', batchId).maybeSingle();
    // Include product info from the order (if available) so we can show product names in the invoice
    let { data: items } = await db.from('payout_batch_items').select('*, order:orders(id, order_code, total_amount, products(name))').eq('batch_id', batchId).eq('vendor_id', vendorId);
    let { data: vendor } = await db.from('profiles').select('id, full_name, phone, wallet_type').eq('id', vendorId).maybeSingle();

    // Fallback: if batch not found, try to find latest batch that contains vendor items
    if (!batch) {
      console.warn('[ADMIN] batch not found, attempting fallback lookup by vendor items');
      const { data: foundItems } = await db.from('payout_batch_items').select('batch_id, created_at').eq('vendor_id', vendorId).order('created_at', { ascending: false }).limit(1);
      console.log('[ADMIN] fallback lookup result count:', (foundItems || []).length);
      if (foundItems && foundItems.length > 0 && foundItems[0].batch_id) {
        batchId = foundItems[0].batch_id;
        console.log('[ADMIN] fallback found batchId for vendor:', batchId);
        const q = await db.from('payout_batches').select('*').eq('id', batchId).maybeSingle();
        batch = q.data;
        const it = await db.from('payout_batch_items').select('*, order:orders(id, order_code, total_amount)').eq('batch_id', batchId).eq('vendor_id', vendorId);
        items = it.data || [];
      }
    }

    if (!batch) {
      console.warn('[ADMIN] No batch found after fallback for batchId/vendorId:', req.params.id, vendorId);
      const hint = process.env.SUPABASE_SERVICE_ROLE_KEY ? '' : ' (possible insufficient DB permissions - SUPABASE_SERVICE_ROLE_KEY missing)';
      return res.status(404).send('Batch not found for this vendor' + hint);
    }

    if (!vendor) {
      console.warn('[ADMIN] vendor not found:', vendorId);
      return res.status(404).send('Vendor not found');
    }

    // If the batch exists but contains no items for this vendor, return a clear message
    if (!items || items.length === 0) {
      console.warn('[ADMIN] Batch exists but no items for vendor in batch:', batchId, 'vendor:', vendorId);
      return res.status(404).send('No payout items found for this vendor in the specified batch');
    }

    // Map rows and extract product name (if present on order.products.name)
    const rows = (items || []).map(i => {
      const productName = i.order && i.order.products ? (i.order.products.name || (Array.isArray(i.order.products) ? (i.order.products[0] && i.order.products[0].name) : null)) : null;
      return {
        order_code: i.order?.order_code || '-',
        product_name: productName || '-',
        gross: Number(i.amount || 0),
        commission: Number(i.commission_amount || 0),
        net: Number(i.net_amount || 0)
      };
    });

    // Compute how many times each product appears in this batch (sales count)
    const productCounts = {};
    for (const r of rows) {
      const key = r.product_name || '-';
      productCounts[key] = (productCounts[key] || 0) + 1;
    }

    const totalGross = rows.reduce((s, r) => s + r.gross, 0);
    const totalCommission = rows.reduce((s, r) => s + r.commission, 0);
    const totalNet = rows.reduce((s, r) => s + r.net, 0);
    const totalQty = rows.length;

    // Simple HTML invoice (Commande now shows product in parens, and a 'Ventes' column shows sales count per product)
    const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Invoice - Batch ${batchId}</title>
          <style>body{font-family: Arial, Helvetica, sans-serif; padding:20px;} table{width:100%; border-collapse:collapse} th,td{border:1px solid #ddd;padding:8px;text-align:left} th{background:#f5f5f5}</style>
        </head>
        <body>
          <h2>Facture de paiement - Batch ${batchId}</h2>
          <p><strong>Vendeur:</strong> ${vendor.full_name || ''} (${vendor.phone || ''})</p>
          <p><strong>Date:</strong> ${new Date(batch.created_at || batch.scheduled_at || Date.now()).toLocaleString()}</p>
          <h3>Détails</h3>
          <table>
            <thead><tr><th>Commande (Produit)</th><th>Ventes</th><th>Brut (FCFA)</th><th>Commission (FCFA)</th><th>Net (FCFA)</th></tr></thead>
            <tbody>
              ${rows.map(r => `<tr><td>${r.order_code} (${r.product_name})</td><td style="text-align:center">${productCounts[r.product_name] || 0}</td><td>${r.gross.toLocaleString()}</td><td>${r.commission.toLocaleString()}</td><td>${r.net.toLocaleString()}</td></tr>`).join('')}
            </tbody>
            <tfoot>
              <tr><th>Total</th><th style="text-align:center">${totalQty}</th><th>${totalGross.toLocaleString()}</th><th>${totalCommission.toLocaleString()}</th><th>${totalNet.toLocaleString()}</th></tr>
            </tfoot>
          </table>
          <p>Montant versé: <strong>${totalNet.toLocaleString()} FCFA</strong></p>
          <p>Signature: _________________________</p>
        </body>
      </html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('[ADMIN] invoice error:', err);
    res.status(500).send(String(err));
  }
});

// Vendor endpoint: list payout batches that include items for the authenticated vendor
app.get('/api/vendor/payout-batches', async (req, res) => {
  try {
    // Determine vendor id from Authorization Bearer token (SMS JWT or Supabase token) or query param vendor_id
    let vendorId = req.query.vendor_id || req.query.vendorId || null;
    const authHeader = req.headers.authorization || req.headers.Authorization || null;

    if (!vendorId && authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && decoded.sub) vendorId = decoded.sub;
      } catch (e) {
        try {
          const { data: { user }, error } = await supabase.auth.getUser(token);
          if (!error && user) vendorId = user.id;
        } catch (e2) { /* ignore */ }
      }
    }

    if (!vendorId) return res.status(401).json({ success: false, error: 'Vendor authentication required' });

    // Find batch ids for this vendor
    const { data: items, error: itemsErr } = await supabase
      .from('payout_batch_items')
      .select('batch_id, created_at')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false });

    if (itemsErr) {
      console.error('[VENDOR] Error fetching payout_batch_items for vendor:', itemsErr);
      return res.status(500).json({ success: false, error: 'DB error' });
    }

    const batchIds = Array.from(new Set((items || []).map(i => i.batch_id).filter(Boolean)));
    if (batchIds.length === 0) return res.json({ success: true, batches: [] });

    const { data: batches, error: batchesErr } = await supabase.from('payout_batches').select('*').in('id', batchIds).order('created_at', { ascending: false });
    if (batchesErr) {
      console.error('[VENDOR] Error fetching batches:', batchesErr);
      return res.status(500).json({ success: false, error: 'DB error' });
    }

    // Optionally enrich batches with item counts and net totals per batch
    const enriched = [];
    for (const b of batches || []) {
      const { data: bItems } = await supabase.from('payout_batch_items').select('id,amount,commission_amount,net_amount').eq('batch_id', b.id).eq('vendor_id', vendorId);
      const itemCount = (bItems || []).length;
      const totalNet = (bItems || []).reduce((s, it) => s + Number(it.net_amount || it.amount || 0), 0);
      enriched.push({ id: b.id, created_at: b.created_at || b.scheduled_at, total_amount: b.total_amount, status: b.status, item_count: itemCount, total_net: totalNet });
    }

    return res.json({ success: true, batches: enriched });
  } catch (err) {
    console.error('[VENDOR] /api/vendor/payout-batches error:', err);
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// Vendor endpoint: render a printable invoice HTML for a specific batch and vendor
app.get('/api/vendor/payout-batches/:id/invoice', async (req, res) => {
  try {
    const batchId = req.params.id;
    const authHeader = req.headers.authorization || req.headers.Authorization || null;
    let vendorId = req.query.vendor_id || req.query.vendorId || null;

    if (!vendorId && authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && decoded.sub) vendorId = decoded.sub;
      } catch (e) {
        try {
          const { data: { user }, error } = await supabase.auth.getUser(token);
          if (!error && user) vendorId = user.id;
        } catch (e2) { /* ignore */ }
      }
    }

    if (!vendorId) return res.status(401).send('Vendor authentication required');
    if (!batchId) return res.status(400).send('batch id required');

    const { data: batch } = await supabase.from('payout_batches').select('*').eq('id', batchId).maybeSingle();
    // Include product info from order.products to show product names
    const { data: items } = await supabase.from('payout_batch_items').select('*, order:orders(id, order_code, total_amount, products(name))').eq('batch_id', batchId).eq('vendor_id', vendorId).order('id', { ascending: true });
    const { data: vendor } = await supabase.from('profiles').select('id, full_name, phone, wallet_type').eq('id', vendorId).maybeSingle();

    if (!batch) return res.status(404).send('batch_not_found');
    if (!vendor) return res.status(404).send('vendor_not_found');
    if (!items || items.length === 0) return res.status(404).send('No payout items found for this vendor in the specified batch');

    const rows = (items || []).map(i => {
      const productName = i.order && i.order.products ? (i.order.products.name || (Array.isArray(i.order.products) ? (i.order.products[0] && i.order.products[0].name) : null)) : null;
      return {
        order_code: i.order?.order_code || '-',
        product_name: productName || '-',
        gross: Number(i.amount || 0),
        commission: Number(i.commission_amount || 0),
        net: Number(i.net_amount || 0)
      };
    });

    const productCounts = {};
    for (const r of rows) productCounts[r.product_name] = (productCounts[r.product_name] || 0) + 1;

    const totalGross = rows.reduce((s, r) => s + r.gross, 0);
    const totalCommission = rows.reduce((s, r) => s + r.commission, 0);
    const totalNet = rows.reduce((s, r) => s + r.net, 0);
    const totalQty = rows.length;

    const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Facture - Batch ${batchId}</title>
          <style>body{font-family: Arial, Helvetica, sans-serif; padding:20px;} table{width:100%; border-collapse:collapse} th,td{border:1px solid #ddd;padding:8px;text-align:left} th{background:#f5f5f5}</style>
        </head>
        <body>
          <h2>Facture de paiement - Batch ${batchId}</h2>
          <p><strong>Vendeur:</strong> ${vendor.full_name || ''} (${vendor.phone || ''})</p>
          <p><strong>Date:</strong> ${new Date(batch.created_at || batch.scheduled_at || Date.now()).toLocaleString()}</p>
          <h3>Détails</h3>
          <table>
            <thead><tr><th>Commande (Produit)</th><th>Ventes</th><th>Brut (FCFA)</th><th>Commission (FCFA)</th><th>Net (FCFA)</th></tr></thead>
            <tbody>
              ${rows.map(r => `<tr><td>${r.order_code} (${r.product_name})</td><td style="text-align:center">${productCounts[r.product_name] || 0}</td><td>${r.gross.toLocaleString()}</td><td>${r.commission.toLocaleString()}</td><td>${r.net.toLocaleString()}</td></tr>`).join('')}
            </tbody>
            <tfoot>
              <tr><th>Total</th><th style="text-align:center">${totalQty}</th><th>${totalGross.toLocaleString()}</th><th>${totalCommission.toLocaleString()}</th><th>${totalNet.toLocaleString()}</th></tr>
            </tfoot>
          </table>
          <p>Montant versé: <strong>${totalNet.toLocaleString()} FCFA</strong></p>
          <p>Signature: _________________________</p>
        </body>
      </html>`;

    const filename = `invoice-batch-${batchId}-vendor-${vendorId}.html`;
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(html);
  } catch (err) {
    console.error('[VENDOR-INVOICE] error:', err);
    return res.status(500).send(String(err));
  }
});

// Helper to process a single payout batch (reusable for cron/manual)
async function processPayoutBatch(batchId) {
  try {
    if (!batchId) return { success: false, error: 'batch id required' };

    const { data: batch, error: batchErr } = await supabase.from('payout_batches').select('*').eq('id', batchId).maybeSingle();
    if (batchErr || !batch) return { success: false, error: 'Batch not found' };
    if (batch.status === 'processing') return { success: false, error: 'Batch already processing' };

    await supabase.from('payout_batches').update({ status: 'processing' }).eq('id', batchId);

    const { data: items } = await supabase.from('payout_batch_items').select('*, order:orders(id, order_code)').eq('batch_id', batchId).in('status', ['queued', 'failed']);
    if (!items || items.length === 0) {
      await supabase.from('payout_batches').update({ status: 'completed', processed_at: new Date().toISOString() }).eq('id', batchId);
      return { success: true, message: 'No items to process' };
    }

    const byVendor = items.reduce((acc, it) => { (acc[it.vendor_id] = acc[it.vendor_id] || []).push(it); return acc; }, {});

    const results = [];
    for (const vendorId of Object.keys(byVendor)) {
      const vendorItems = byVendor[vendorId];

      // Verify each item/order for eligibility and split eligible vs ineligible
      const eligibleItems = [];
      const ineligible = [];
      for (const it of vendorItems) {
        try {
          const report = await verifyOrderForPayout(it.order_id);
          if (report.ok && report.eligible) {
            eligibleItems.push(it);
          } else {
            ineligible.push({ item: it, reason: report });
          }
        } catch (e) {
          ineligible.push({ item: it, reason: { ok: false, error: String(e) } });
        }
      }

      // Mark ineligible items as failed with reasons
      if (ineligible.length > 0) {
        const ids = ineligible.map(i => i.item.id);
        try {
          await supabase.from('payout_batch_items').update({ status: 'failed', provider_response: JSON.stringify({ error: 'order_not_eligible', details: ineligible.map(i => i.reason) }) }).in('id', ids);
        } catch (e) {
          console.error('[ADMIN] failed marking ineligible payout items:', e);
        }
      }

      if (eligibleItems.length === 0) {
        results.push({ vendorId, success: false, error: 'no_eligible_items' });
        continue;
      }

      // Use net_amount (gross - commission) to compute payout per vendor
      const totalNet = eligibleItems.reduce((s, it) => s + Number(it.net_amount || it.amount || 0), 0);

      const { data: vendor } = await supabase.from('profiles').select('id, phone, wallet_type').eq('id', vendorId).maybeSingle();
      if (!vendor || !vendor.phone) {
        const failReason = 'Vendor phone not found';
        await supabase.from('payout_batch_items').update({ status: 'failed', provider_response: JSON.stringify({ error: failReason }) }).in('id', eligibleItems.map(i => i.id));
        results.push({ vendorId, success: false, error: failReason });
        continue;
      }

      try {
        const payoutRes = await pixpaySendMoney({ amount: totalNet, phone: vendor.phone, orderId: batchId, type: 'vendor_payout', walletType: vendor.wallet_type || 'wave-senegal' });

        if (payoutRes && payoutRes.transaction_id) {
          // Record aggregated payout transaction and link to batch_id (not a single order)
          await supabase.from('payment_transactions').insert({ transaction_id: payoutRes.transaction_id, provider: 'pixpay', batch_id: batchId, order_id: null, amount: totalNet, phone: vendor.phone, status: payoutRes.state || 'PENDING1', transaction_type: 'payout', raw_response: normalizeJsonField(payoutRes.raw), provider_response: normalizeJsonField(payoutRes.raw) });
          // mark batch items as processing (will be set to 'paid' by webhook on SUCCESSFUL)
          await supabase.from('payout_batch_items').update({ status: 'processing', provider_transaction_id: payoutRes.transaction_id, provider_response: normalizeJsonField(payoutRes.raw) }).in('id', eligibleItems.map(i => i.id));
          const orderIds = eligibleItems.map(i => i.order_id).filter(Boolean);
          if (orderIds.length > 0) await supabase.from('orders').update({ payout_status: 'processing', payout_processing_at: new Date().toISOString() }).in('id', orderIds);
          results.push({ vendorId, success: true, transaction_id: payoutRes.transaction_id, total_net: totalNet });
        } else {
          await supabase.from('payout_batch_items').update({ status: 'failed', provider_response: JSON.stringify(payoutRes || { error: 'Unknown payout response' }) }).in('id', eligibleItems.map(i => i.id));
          results.push({ vendorId, success: false, error: payoutRes?.message || 'Payout failed' });
        }
      } catch (err) {
        console.error('[ADMIN] payout batch vendor error:', err);
        await supabase.from('payout_batch_items').update({ status: 'failed', provider_response: JSON.stringify({ error: String(err) }) }).in('id', eligibleItems.map(i => i.id));
        results.push({ vendorId, success: false, error: String(err) });
      }
    }

    const anyFailed = results.some(r => !r.success);
    await supabase.from('payout_batches').update({ status: anyFailed ? 'failed' : 'completed', processed_at: new Date().toISOString() }).eq('id', batchId);

    return { success: true, results };
  } catch (error) {
    console.error('[ADMIN] processPayoutBatch error:', error);
    try { await supabase.from('payout_batches').update({ status: 'failed' }).eq('id', batchId); } catch (e) { console.error('[ADMIN] failed marking batch failed:', e); }
    return { success: false, error: String(error) };
  }
}

// Process a payout batch (admin triggers payouts per vendor, aggregated)
app.post('/api/admin/payout-batches/:id/process', requireAdmin, async (req, res) => {
  try {
    const batchId = req.params.id;
    const result = await processPayoutBatch(batchId);
    if (!result || !result.success) return res.status(500).json(result);
    res.json(result);
  } catch (error) {
    console.error('[ADMIN] process payout batch error (outer):', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Cancel a payout batch
app.post('/api/admin/payout-batches/:id/cancel', requireAdmin, async (req, res) => {
  try {
    const batchId = req.params.id;
    if (!batchId) return res.status(400).json({ success: false, error: 'batch id required' });

    await supabase.from('payout_batches').update({ status: 'cancelled', processed_at: new Date().toISOString() }).eq('id', batchId);
    // revert item states and orders
    const { data: items } = await supabase.from('payout_batch_items').select('*').eq('batch_id', batchId);
    if (items && items.length > 0) {
      await supabase.from('payout_batch_items').update({ status: 'failed', provider_response: JSON.stringify({ reason: 'Batch cancelled' }) }).eq('batch_id', batchId);
      const orderIds = items.map(i => i.order_id).filter(Boolean);
      if (orderIds.length > 0) await supabase.from('orders').update({ payout_status: 'requested' }).in('id', orderIds);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[ADMIN] cancel payout batch error:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Admin utility: finalize payout (force mark transaction/batch as SUCCESSFUL and finalize DB state)
app.post('/api/admin/finalize-payout', requireAdmin, async (req, res) => {
  try {
    const { transaction_id, batch_id, provider_response } = req.body || {};
    if (!transaction_id && !batch_id) return res.status(400).json({ success: false, error: 'transaction_id or batch_id required' });

    if (transaction_id) {
      // Update the payment transaction
      const { data: txs, error: txErr } = await supabase.from('payment_transactions').select('*').eq('transaction_id', transaction_id).limit(1);
      if (txErr) throw txErr;
      if (!txs || txs.length === 0) return res.status(404).json({ success: false, error: 'transaction not found' });
      const tx = txs[0];

      await supabase.from('payment_transactions').update({ status: 'SUCCESSFUL', provider_response: provider_response || tx.provider_response || null, provider_transaction_id: transaction_id, provider_error: null, updated_at: new Date().toISOString() }).eq('transaction_id', transaction_id);

      // If this tx references an order, mark order paid
      if (tx.order_id) {
        await supabase.from('orders').update({ payout_status: 'paid', payout_paid_at: new Date().toISOString() }).eq('id', tx.order_id);
      }

      // If tx references a batch, finalize batch
      if (tx.batch_id) {
        const batchId = tx.batch_id;
        const { data: items } = await supabase.from('payout_batch_items').select('id,order_id').eq('batch_id', batchId);
        if (items && items.length > 0) {
          const itemIds = items.map(i => i.id);
          const orderIds = items.map(i => i.order_id).filter(Boolean);
          await supabase.from('payout_batch_items').update({ status: 'paid' }).in('id', itemIds);
          if (orderIds.length > 0) await supabase.from('orders').update({ payout_status: 'paid', payout_paid_at: new Date().toISOString() }).in('id', orderIds);
        }
        await supabase.from('payout_batches').update({ status: 'completed', processed_at: new Date().toISOString() }).eq('id', batchId);
      }

      return res.json({ success: true, message: 'transaction finalized', transaction_id });
    }

    // finalize by batch_id
    if (batch_id) {
      const { data: txsBatch } = await supabase.from('payment_transactions').select('*').eq('batch_id', batch_id).limit(1);
      if (txsBatch && txsBatch.length > 0) {
        const txb = txsBatch[0];
        await supabase.from('payment_transactions').update({ status: 'SUCCESSFUL', provider_response: provider_response || txb.provider_response || null, provider_transaction_id: txb.provider_transaction_id || txb.transaction_id || null, provider_error: null, updated_at: new Date().toISOString() }).eq('batch_id', batch_id);
      }

      const { data: items } = await supabase.from('payout_batch_items').select('id,order_id').eq('batch_id', batch_id);
      if (items && items.length > 0) {
        const itemIds = items.map(i => i.id);
        const orderIds = items.map(i => i.order_id).filter(Boolean);
        await supabase.from('payout_batch_items').update({ status: 'paid' }).in('id', itemIds);
        if (orderIds.length > 0) await supabase.from('orders').update({ payout_status: 'paid', payout_paid_at: new Date().toISOString() }).in('id', orderIds);
      }
      await supabase.from('payout_batches').update({ status: 'completed', processed_at: new Date().toISOString() }).eq('id', batch_id);

      return res.json({ success: true, message: 'batch finalized', batch_id });
    }

  } catch (error) {
    console.error('[ADMIN] finalize-payout error:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Trigger processing of scheduled batches (admin manual trigger)
app.post('/api/admin/payout-batches/process-scheduled', requireAdmin, async (req, res) => {
  try {
    const now = new Date().toISOString();
    const { data: batches, error } = await supabase.from('payout_batches').select('*').lte('scheduled_at', now).eq('status', 'scheduled').limit(100);
    if (error) throw error;
    const summaries = [];
    for (const b of batches || []) {
      const r = await processPayoutBatch(b.id);
      summaries.push({ batch: b.id, result: r });
    }
    res.json({ success: true, processed: summaries.length, summaries });
  } catch (err) {
    console.error('[ADMIN] process-scheduled error:', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// Optional scheduler for automatic batch processing (enabled via env)
if (process.env.ENABLE_PAYOUT_SCHEDULER === 'true') {
  try {
    const cron = require('node-cron');
    const expr = process.env.PAYOUT_SCHEDULE_CRON || '0 2 * * *'; // default daily at 02:00
    cron.schedule(expr, async () => {
      console.log(`[SCHEDULER] Running payout scheduler at ${new Date().toISOString()} (cron: ${expr})`);
      try {
        const now = new Date().toISOString();
        const { data: batches } = await supabase.from('payout_batches').select('*').lte('scheduled_at', now).eq('status', 'scheduled').limit(100);
        for (const b of batches || []) {
          const r = await processPayoutBatch(b.id);
          console.log('[SCHEDULER] processed batch', b.id, r && r.success ? 'OK' : r);
        }
      } catch (e) {
        console.error('[SCHEDULER] Error during scheduled processing:', e);
      }
    }, { scheduled: true });
    console.log(`[SCHEDULER] Payout scheduler enabled (${expr})`);
  } catch (e) {
    console.warn('[SCHEDULER] node-cron not installed, scheduler disabled');
  }
}

// Optional payment reconciler: mark old PENDING transactions as SUCCESSFUL (configurable and disabled by default)
if (process.env.ENABLE_PAYMENT_RECONCILER === 'true') {
  try {
    const cron = require('node-cron');
    const expr = process.env.PAYMENT_RECONCILE_CRON || '*/5 * * * *'; // default every 5 minutes
    const reconcileMinutes = parseInt(process.env.PAYMENT_RECONCILE_MINUTES || '15', 10);
    const forceConfirm = String(process.env.PAYMENT_RECONCILE_FORCE || 'false').toLowerCase() === 'true';

    async function reconcilePendingPayments() {
      console.log(`[RECONCILER] Running payment reconciler at ${new Date().toISOString()} (older than ${reconcileMinutes}m, forceConfirm=${forceConfirm})`);
      try {
        const threshold = new Date(Date.now() - reconcileMinutes * 60 * 1000).toISOString();
        const { data: txs, error } = await supabase
          .from('payment_transactions')
          .select('*')
          .in('status', ['PENDING1','PENDING2'])
          .lte('created_at', threshold)
          .limit(200);
        if (error) {
          console.error('[RECONCILER] Error fetching pending transactions:', error);
          return;
        }
        if (!txs || txs.length === 0) {
          console.log('[RECONCILER] No pending transactions found');
          return;
        }

        for (const tx of txs) {
          try {
            console.log('[RECONCILER] Inspecting tx:', tx.transaction_id, tx.id, 'order_id:', tx.order_id, 'status:', tx.status);

            // Try provider status check if available
            let providerOk = false;
            try {
              const pixpay = require('./pixpay');
              const check = await pixpay.checkTransactionStatus(tx.transaction_id);
              if (check && check.success && (check.state === 'SUCCESS' || check.state === 'SUCCESSFUL' || check.state === 'COMPLETED')) {
                providerOk = true;
              } else {
                // check may not be supported by provider; fallback to forceConfirm
                console.log('[RECONCILER] provider check result for', tx.transaction_id, check);
              }
            } catch (e) {
              console.warn('[RECONCILER] provider check failed or not supported for tx:', tx.transaction_id, e?.message || e);
            }

            if (providerOk || forceConfirm) {
              // Mark transaction SUCCESSFUL
              const { error: updErr } = await supabase.from('payment_transactions').update({ status: 'SUCCESSFUL', updated_at: new Date().toISOString(), provider_response: JSON.stringify({ reconciled: true, reconciler: 'system', timestamp: new Date().toISOString() }) }).eq('id', tx.id);
              if (updErr) {
                console.error('[RECONCILER] Failed to mark tx successful:', tx.id, updErr);
                continue;
              }
              console.log('[RECONCILER] Marked transaction SUCCESSFUL:', tx.transaction_id, tx.id);

              // Note: the trigger payment_transactions_sync_orders_fn will synchronize orders/payouts
            } else {
              console.log('[RECONCILER] Not confirmed for tx:', tx.transaction_id, '- skipping (provider check negative)');
            }
          } catch (e) {
            console.error('[RECONCILER] Exception handling tx:', tx.id, e);
          }
        }
      } catch (e) {
        console.error('[RECONCILER] Exception:', e);
      }
    }

    // Schedule
    cron.schedule(expr, async () => {
      try {
        await reconcilePendingPayments();
      } catch (e) {
        console.error('[RECONCILER] Scheduled run failed:', e);
      }
    }, { scheduled: true });

    console.log(`[RECONCILER] Payment reconciler enabled (${expr})`);
  } catch (e) {
    console.warn('[RECONCILER] node-cron not installed, reconciler disabled');
  }
}


// Remboursement client (annulation commande)
app.post('/api/payment/pixpay/refund', async (req, res) => {
  try {
    const { orderId, reason } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'orderId requis'
      });
    }

    console.log('[REFUND] Demande de remboursement:', { orderId, reason });

    // 1) Récupérer la commande avec les infos de l'acheteur
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id, status, total_amount, buyer_id, payment_method,
        buyer:profiles!orders_buyer_id_fkey(phone, wallet_type, full_name)
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      console.error('[REFUND] Commande non trouvée:', orderError);
      return res.status(404).json({
        success: false,
        error: 'Commande non trouvée'
      });
    }

    // 2) Vérifier que la commande peut être remboursée (status = paid ou in_delivery)
    if (!['paid', 'in_delivery'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        error: `Impossible de rembourser une commande avec le statut: ${order.status}`
      });
    }

    // 3) Récupérer le téléphone et wallet_type de l'acheteur
    const buyerPhone = order.buyer?.phone;
    // Déterminer le wallet_type à partir du payment_method de la commande
    let walletType = order.buyer?.wallet_type;
    if (!walletType && order.payment_method) {
      // Mapper payment_method vers wallet_type
      if (order.payment_method === 'wave') {
        walletType = 'wave-senegal';
      } else if (order.payment_method === 'orange_money') {
        walletType = 'orange-senegal';
      }
    }

    if (!buyerPhone) {
      return res.status(400).json({
        success: false,
        error: 'Numéro de téléphone de l\'acheteur non trouvé'
      });
    }

    if (!walletType) {
      return res.status(400).json({
        success: false,
        error: 'Type de portefeuille non déterminé pour le remboursement'
      });
    }

    console.log('[REFUND] Infos acheteur:', { buyerPhone, walletType, amount: order.total_amount });

    // 4) Effectuer le remboursement via PixPay
    const result = await pixpaySendMoney({
      amount: order.total_amount,
      phone: buyerPhone,
      orderId: orderId,
      type: 'refund',
      walletType: walletType
    });

    console.log('[REFUND] Résultat PixPay:', result);

    // 5) Mettre à jour le statut de la commande
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason || 'Remboursement client'
      })
      .eq('id', orderId);

    if (updateError) {
      console.error('[REFUND] Erreur mise à jour commande:', updateError);
    }

    // 6) Enregistrer la transaction de remboursement
    if (result.transaction_id) {
      const { error: txError } = await supabase
        .from('payment_transactions')
        .insert({
          transaction_id: result.transaction_id,
          provider: 'pixpay',
          order_id: orderId,
          amount: order.total_amount,
          phone: buyerPhone,
          status: result.state || 'PENDING1',
          transaction_type: 'refund',
          raw_response: result.raw
        });

      if (txError) {
        console.error('[REFUND] Erreur enregistrement transaction:', txError);
      }
    }

    return res.json({
      success: result.success,
      transaction_id: result.transaction_id,
      message: result.success 
        ? `Remboursement de ${order.total_amount} FCFA initié vers ${buyerPhone}`
        : result.message
    });

  } catch (error) {
    console.error('[REFUND] Erreur:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erreur lors du remboursement'
    });
  }
});

// ==========================================
// ENDPOINTS PUSH NOTIFICATIONS (FCM HTTP v1)
// ==========================================

// Envoyer une notification à un appareil
app.post('/api/push/send', async (req, res) => {
  try {
    const { token, title, body, data } = req.body;

    if (!token || !title || !body) {
      return res.status(400).json({ 
        success: false, 
        error: 'Token, title et body sont requis' 
      });
    }

    console.log(`[PUSH] Envoi notification à: ${token.substring(0, 20)}...`);

    const result = await sendPushNotification(token, title, body, data || {});

    res.json({ success: true, result });
  } catch (error) {
    console.error('[PUSH] Erreur envoi:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Envoyer une notification à plusieurs appareils
app.post('/api/push/send-multiple', async (req, res) => {
  try {
    const { tokens, title, body, data } = req.body;

    if (!tokens || !Array.isArray(tokens) || tokens.length === 0 || !title || !body) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tokens (array), title et body sont requis' 
      });
    }

    console.log(`[PUSH] Envoi notification à ${tokens.length} appareils`);

    const result = await sendPushToMultiple(tokens, title, body, data || {});

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[PUSH] Erreur envoi multiple:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Envoyer une notification à un topic
app.post('/api/push/send-topic', async (req, res) => {
  try {
    const { topic, title, body, data } = req.body;

    if (!topic || !title || !body) {
      return res.status(400).json({ 
        success: false, 
        error: 'Topic, title et body sont requis' 
      });
    }

    console.log(`[PUSH] Envoi notification au topic: ${topic}`);

    const result = await sendPushToTopic(topic, title, body, data || {});

    res.json({ success: true, result });
  } catch (error) {
    console.error('[PUSH] Erreur envoi topic:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ENDPOINTS NOTIFICATIONS AUTOMATIQUES
// ==========================================

// Notification de bienvenue (à appeler une seule fois côté app)
app.post('/api/notify/welcome', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, error: 'token requis' });
    }

    const result = await sendPushNotification(
      token,
      'Bienvenue sur Validèl!',
      'Vous serez informé de vos commandes et livraisons en temps réel. Bonne expérience!',
      { type: 'welcome', click_action: 'OPEN_HOME' }
    );

    res.json({ success: true, sent: true, result });
  } catch (error) {
    console.error('[NOTIFY] Erreur welcome:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Notifier le Vendeur(se) d'une nouvelle commande
app.post('/api/notify/new-order', async (req, res) => {
  try {
    const { vendorId, orderId, buyerName, productName, amount } = req.body;

    if (!vendorId || !orderId) {
      return res.status(400).json({ success: false, error: 'vendorId et orderId requis' });
    }

    const result = await notificationService.notifyVendorNewOrder(vendorId, {
      orderId,
      buyerName,
      productName,
      amount
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[NOTIFY] Erreur new-order:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Notifier l'acheteur que sa commande est confirmée
app.post('/api/notify/order-confirmed', async (req, res) => {
  try {
    const { buyerId, orderId, orderCode } = req.body;

    if (!buyerId || !orderId) {
      return res.status(400).json({ success: false, error: 'buyerId et orderId requis' });
    }

    const result = await notificationService.notifyBuyerOrderConfirmed(buyerId, {
      orderId,
      orderCode
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[NOTIFY] Erreur order-confirmed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Notifier le livreur qu'une commande lui est assignée
app.post('/api/notify/delivery-assigned', async (req, res) => {
  try {
    const { deliveryPersonId, orderId, deliveryAddress, productName } = req.body;

    if (!deliveryPersonId || !orderId) {
      return res.status(400).json({ success: false, error: 'deliveryPersonId et orderId requis' });
    }

    const result = await notificationService.notifyDeliveryPersonAssigned(deliveryPersonId, {
      orderId,
      deliveryAddress,
      productName
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[NOTIFY] Erreur delivery-assigned:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Notifier l'acheteur que la livraison est en cours
app.post('/api/notify/delivery-started', async (req, res) => {
  try {
    const { buyerId, orderId, orderCode } = req.body;

    if (!buyerId || !orderId) {
      return res.status(400).json({ success: false, error: 'buyerId et orderId requis' });
    }

    // Aller chercher le nom du produit et le numéro du livreur
    let productName = null;
    let deliveryPersonPhone = null;
    let order_code = orderCode;
    try {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('order_code, product:products(name), delivery_person:profiles!orders_delivery_person_id_fkey(phone)')
        .eq('id', orderId)
        .single();
      if (!orderError && order) {
        if (order.product && order.product.name) productName = order.product.name;
        if (order.delivery_person && order.delivery_person.phone) deliveryPersonPhone = order.delivery_person.phone;
        if (order.order_code) order_code = order.order_code;
      }
    } catch (e) {
      console.error('[NOTIFY] Erreur récupération infos commande pour SMS:', e);
    }

    const result = await notificationService.notifyBuyerDeliveryStarted(buyerId, {
      orderId,
      orderCode: order_code,
      productName,
      deliveryPersonPhone
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[NOTIFY] Erreur delivery-started:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Notifier la fin de livraison (vendeur(se) + acheteur)
app.post('/api/notify/delivery-completed', async (req, res) => {
  try {
    const { vendorId, buyerId, orderId, orderCode } = req.body;

    if (!vendorId || !buyerId || !orderId) {
      return res.status(400).json({ success: false, error: 'vendorId, buyerId et orderId requis' });
    }

    const results = await notificationService.notifyDeliveryCompleted(vendorId, buyerId, {
      orderId,
      orderCode
    });

    res.json({ success: true, results });
  } catch (error) {
    console.error('[NOTIFY] Erreur delivery-completed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Notifier les admins qu'une commande a été marquée livrée et nécessite validation du paiement
app.post('/api/notify/admin-delivery-request', async (req, res) => {
  try {
    const { orderId, requestedBy } = req.body || {};
    if (!orderId) return res.status(400).json({ success: false, error: 'orderId requis' });

    // Mettre à jour la commande pour indiquer qu'un paiement a été demandé
    try {
      const { error: updateErr } = await supabase
        .from('orders')
        .update({ payout_status: 'requested', payout_requested_at: new Date().toISOString(), payout_requested_by: requestedBy || null })
        .eq('id', orderId);
      if (updateErr) console.error('[NOTIFY-ADMIN] Erreur update order payout_status:', updateErr);
    } catch (e) {
      console.error('[NOTIFY-ADMIN] Erreur tentative update order:', e);
    }

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, order_code, vendor_id, total_amount')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr) {
      console.error('[NOTIFY-ADMIN] Erreur récupération commande:', orderErr);
    }

    // Récupérer la liste des admins (env var ou table)
    const adminId = process.env.ADMIN_USER_ID;
    let adminUsers = [];
    if (adminId) {
      adminUsers.push(adminId);
    } else {
      const { data: admins, error: adminsErr } = await supabase.from('admin_users').select('id');
      if (!adminsErr && admins && Array.isArray(admins)) {
        adminUsers = admins.map(a => a.id);
      }
    }

    // Envoyer une notification push à chaque admin
    for (const admin of adminUsers) {
      try {
        await notificationService.sendPushNotificationToUser(admin, 'Livraison à valider', `La commande ${order?.order_code || orderId} a été marquée livrée et demande un paiement vendeur. Merci de vérifier.`, { type: 'admin_review_delivery', orderId });
      } catch (e) {
        console.error('[NOTIFY-ADMIN] Erreur notification admin:', e);
      }
    }

    return res.json({ success: true, notified: adminUsers.length });
  } catch (err) {
    console.error('[NOTIFY-ADMIN] Erreur:', err);
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// Mark an order as delivered and set payout request automatically
// Nouvelle version conforme et robuste de la route /api/orders/mark-in-delivery
app.post('/api/orders/mark-in-delivery', async (req, res) => {
  try {
    // Accepter les deux formats : orderId et orderId
    const orderId = req.body.orderId || req.body.order_id || req.body.id;
    let deliveryPersonId = req.body.deliveryPersonId || req.body.delivery_person_id || req.body.deliveryPerson || null;
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'orderId required' });
    }

    // If deliveryPersonId was not provided, try to infer from Authorization bearer token (Supabase session or JWT)
    if (!deliveryPersonId) {
      try {
        const authHeader = req.headers.authorization;
        if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
          const token = authHeader.split(' ')[1];
          try {
            const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
            if (!userErr && user && user.id) {
              deliveryPersonId = user.id;
              console.log('[MARK-IN-DELIVERY] Inferred deliveryPersonId from bearer token:', deliveryPersonId);
            }
          } catch (e) {
            // ignore and continue; deliveryPersonId remains null
          }
        }
      } catch (e) {
        // ignore
      }
    }

    // Fetch current order with buyer, delivery person, and product info
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select(`
        id, status, buyer_id, order_code, delivery_person_id,
        buyer:profiles!orders_buyer_id_fkey(phone),
        delivery_person:profiles!orders_delivery_person_id_fkey(phone),
        product:products(name)
      `)
      .eq('id', orderId)
      .maybeSingle();
    if (orderErr || !order) {
      return res.status(404).json({ success: false, error: 'order_not_found' });
    }

    // Update only if status is assigned or paid (allow starting delivery from 'paid')
    if (!['assigned', 'paid'].includes(order.status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'order_not_assignable',
        currentStatus: order.status 
      });
    }

    const prevStatus = order.status;
    const updates = { 
      status: 'in_delivery', 
      in_delivery_at: new Date().toISOString(),
      previous_status: prevStatus
    };
    // Use deliveryPersonId from request or keep existing
    if (deliveryPersonId) {
      updates.delivery_person_id = deliveryPersonId;
    }

    // Tentative d'update robuste : si une colonne manque dans le schéma (PGRST204),
    // on supprime les clés problématiques et on réessaie.
    async function safeUpdateOrder(id, updateObj) {
      try {
        const { error } = await supabase.from('orders').update(updateObj).eq('id', id);
        if (!error) return { ok: true, used: updateObj, removed: [] };

        const msg = String(error?.message || '');
        console.error('[MARK-IN-DELIVERY] Première tentative update returned error:', error);

        // Detecte l'erreur PostgREST sur colonne manquante
        const missingCols = [];
        const regex = /Could not find the '(.+?)' column/g;
        let m;
        while ((m = regex.exec(msg)) !== null) {
          missingCols.push(m[1]);
        }

        if (missingCols.length === 0) {
          // Si ce n'est pas une erreur de colonne manquante, retour d'erreur
          return { ok: false, error };
        }

        // Supprimer les colonnes manquantes des updates et réessayer
        const cleaned = { ...updateObj };
        for (const col of missingCols) {
          if (col in cleaned) {
            delete cleaned[col];
          }
        }
        if (Object.keys(cleaned).length === 0) {
          return { ok: false, error, removed: missingCols };
        }

        const { error: retryErr } = await supabase.from('orders').update(cleaned).eq('id', id);
        if (!retryErr) return { ok: true, used: cleaned, removed: missingCols };

        console.error('[MARK-IN-DELIVERY] Retry update failed:', retryErr);
        return { ok: false, error: retryErr, removed: missingCols };
      } catch (e) {
        console.error('[MARK-IN-DELIVERY] safeUpdateOrder exception:', e);
        return { ok: false, exception: e };
      }
    }

    const safeRes = await safeUpdateOrder(orderId, updates);
    if (!safeRes.ok) {
      console.error('[MARK-IN-DELIVERY] Erreur update order finale:', safeRes.error || safeRes.exception);
      return res.status(500).json({ 
        success: false, 
        error: 'update_failed',
        details: (safeRes.error && safeRes.error.message) ? safeRes.error.message : String(safeRes.exception || safeRes.error)
      });
    }

    // Envoi d'un SMS à l'acheteur avec le numéro du livreur et le nom du produit
    try {
      const buyerPhone = order.buyer?.phone;
      // Si le numéro du livreur n'est pas dans la commande, on va le chercher
      let deliveryPhone = order.delivery_person?.phone;
      if (!deliveryPhone && deliveryPersonId) {
        deliveryPhone = await getDeliveryPersonPhone(deliveryPersonId);
      }
      const productName = order.product?.name || 'votre commande';
      if (buyerPhone && deliveryPhone) {
        const smsText = `Votre commande de "${productName}" sur VALIDEL est en cours de livraison. Numero livreur : ${deliveryPhone}`;
        await notificationService.sendSMS(buyerPhone, smsText);
        // Envoi aussi d'une notification push (optionnel)
        if (order.buyer_id) {
          await notificationService.sendPushNotificationToUser(
            order.buyer_id, 
            '🚚 Livraison en cours', 
            `Votre commande est en cours de livraison. Livreur: ${deliveryPhone}`
          );
        }
      }
    } catch (smsErr) {
      console.error('[MARK-IN-DELIVERY] SMS/Push error:', smsErr);
      // Ne pas échouer la requête principale à cause de l'erreur de notification
    }

    // Fetch the updated order row to return to the caller (useful for UI immediate update)
    let updatedOrder = null;
    try {
      const { data: refreshed, error: refErr } = await supabase
        .from('orders')
        .select(`*, products(name, code), buyer_profile:profiles!orders_buyer_id_fkey(full_name, phone), vendor_profile:profiles!orders_vendor_id_fkey(full_name, phone)`)
        .eq('id', orderId)
        .maybeSingle();
      if (!refErr && refreshed) updatedOrder = refreshed;
      if (refErr) console.warn('[MARK-IN-DELIVERY] Warning fetching updated order:', refErr);

      // If delivery_person_id is still missing but we have deliveryPersonId, try to set it explicitly
      if (deliveryPersonId && updatedOrder && !updatedOrder.delivery_person_id) {
        try {
          console.log('[MARK-IN-DELIVERY] delivery_person_id missing after update, attempting explicit set to:', deliveryPersonId);
          const { error: setErr } = await supabase.from('orders').update({ delivery_person_id: deliveryPersonId }).eq('id', orderId);
          if (setErr) {
            console.error('[MARK-IN-DELIVERY] Error setting delivery_person_id explicitly:', setErr);
          } else {
            const { data: refreshed2, error: refErr2 } = await supabase
              .from('orders')
              .select(`*, products(name, code), buyer_profile:profiles!orders_buyer_id_fkey(full_name, phone), vendor_profile:profiles!orders_vendor_id_fkey(full_name, phone)`)
              .eq('id', orderId)
              .maybeSingle();
            if (!refErr2 && refreshed2) updatedOrder = refreshed2;
            if (refErr2) console.warn('[MARK-IN-DELIVERY] Warning fetching updated order after set delivery_person_id:', refErr2);
          }
        } catch (e) {
          console.warn('[MARK-IN-DELIVERY] Exception attempting to set delivery_person_id explicitly:', e);
        }
      }

      // If delivery_person_id is still missing, log explicitly for debugging
      if (!updatedOrder || !updatedOrder.delivery_person_id) {
        console.warn('[MARK-IN-DELIVERY] Warning: delivery_person_id is not set on order after mark-in-delivery', { orderId, deliveryPersonId, updatedOrder });
      }
    } catch (e) {
      console.warn('[MARK-IN-DELIVERY] Exception fetching updated order:', e);
    }

    res.json({ 
      success: true, 
      orderId, 
      updated: safeRes.used,
      removedColumns: safeRes.removed || [],
      order: updatedOrder,
      message: 'Livraison démarrée avec succès' 
    });
  } catch (err) {
    console.error('[MARK-IN-DELIVERY] Error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'internal_server_error',
      message: String(err) 
    });
  }
});

// Helper function to get delivery person phone
async function getDeliveryPersonPhone(deliveryPersonId) {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('phone')
      .eq('id', deliveryPersonId)
      .single();
    return data?.phone;
  } catch (e) {
    console.error('Error getting delivery person phone:', e);
    return null;
  }
}

app.post('/api/orders/mark-delivered', async (req, res) => {
  try {
    const { orderId, deliveredBy } = req.body || {};
    if (!orderId) return res.status(400).json({ success: false, error: 'orderId required' });

    // Fetch current order
    const { data: order, error: orderErr } = await supabase.from('orders').select('id, status, payout_status, buyer_id, vendor_id, order_code').eq('id', orderId).maybeSingle();
    if (orderErr || !order) return res.status(404).json({ success: false, error: 'order_not_found' });

    // Update only if status not already delivered
    const updates = { status: 'delivered', delivered_at: new Date().toISOString() };

    // If payout_status is not already requested/scheduled/paid, set it to requested
    const currentPayout = order.payout_status;
    if (!['requested','scheduled','paid'].includes(currentPayout)) {
      updates.payout_status = 'requested';
      updates.payout_requested_at = new Date().toISOString();
      updates.payout_requested_by = deliveredBy || null;
    }

    const { error: updateErr } = await supabase.from('orders').update(updates).eq('id', orderId);
    if (updateErr) console.error('[MARK-DELIVERED] Erreur update order:', updateErr);

    // Notify buyer and vendor about completed delivery
    try {
      if (order.buyer_id) await notificationService.sendPushNotificationToUser(order.buyer_id, '✅ Livraison effectuée!', `Votre commande ${order.order_code || ''} est livrée.`);
      if (order.vendor_id) await notificationService.sendPushNotificationToUser(order.vendor_id, '✅ Commande livrée', `La commande ${order.order_code || ''} a été livrée.`);
    } catch (notifErr) {
      console.error('[MARK-DELIVERED] Notification error:', notifErr);
    }

    // Notify admins (reuse admin notify flow)
    try {
      await axios.post(`${process.env.INTERNAL_BASE_URL || 'http://localhost:' + (process.env.PORT || 5000)}/api/notify/admin-delivery-request`, { orderId, requestedBy: deliveredBy });
    } catch (e) {
      // best-effort; if the same server call fails (self-call), just log
      console.error('[MARK-DELIVERED] Failed to call admin notify endpoint:', e?.message || e);
    }

    res.json({ success: true, orderId, updated: updates });
  } catch (err) {
    console.error('[MARK-DELIVERED] Error:', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// Admin: scan for orders with status=delivered and missing payout_status then set payout_status=requested
app.post('/api/admin/sync-delivered-payouts', requireAdmin, async (req, res) => {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, order_code, status, payout_status, vendor_id')
      .eq('status', 'delivered')
      .not('payout_status', 'in', '(requested,scheduled,paid)')
      .limit(1000);

    if (error) throw error;
    if (!orders || orders.length === 0) return res.json({ success: true, updated: 0 });

    const ids = orders.map(o => o.id);
    const now = new Date().toISOString();
    const { error: updateErr } = await supabase.from('orders').update({ payout_status: 'requested', payout_requested_at: now }).in('id', ids);
    if (updateErr) throw updateErr;

    // Notify admins for each updated order
    let adminUsers = [];
    const adminId = process.env.ADMIN_USER_ID;
    if (adminId) adminUsers.push(adminId);
    else {
      const { data: admins } = await supabase.from('admin_users').select('id');
      adminUsers = (admins || []).map(a => a.id);
    }

    for (const o of orders) {
      for (const admin of adminUsers) {
        try {
          await notificationService.sendPushNotificationToUser(admin, 'Livraison à valider', `La commande ${o.order_code || o.id} est livrée et demande validation pour paiement`, { type: 'admin_review_delivery', orderId: o.id });
        } catch (e) {
          console.error('[SYNC-DELIVERED] notify admin failed:', e);
        }
      }
    }

    res.json({ success: true, updated: ids.length });
  } catch (err) {
    console.error('[SYNC-DELIVERED] Error:', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ==========================================

// Utilisation de l'API PayDunya en production ou sandbox
const PAYDUNYA_MODE = process.env.PAYDUNYA_MODE || 'prod';
const PAYDUNYA_API_BASE = PAYDUNYA_MODE === 'sandbox'
  ? 'https://app.paydunya.com/sandbox-api/v1'
  : 'https://app.paydunya.com/api/v1';
const PAYDUNYA_SOFTPAY_WAVE = PAYDUNYA_MODE === 'sandbox'
  ? 'https://app.paydunya.com/sandbox-api/v1/softpay/wave-senegal'
  : 'https://app.paydunya.com/api/v1/softpay/wave-senegal';
const PAYDUNYA_SOFTPAY_OM = PAYDUNYA_MODE === 'sandbox'
  ? 'https://app.paydunya.com/sandbox-api/v1/softpay/orange-money-senegal'
  : 'https://app.paydunya.com/api/v1/softpay/orange-money-senegal';
const PAYDUNYA_SOFTPAY_NEW_OM = PAYDUNYA_MODE === 'sandbox'
  ? 'https://app.paydunya.com/sandbox-api/v1/softpay/new-orange-money-senegal'
  : 'https://app.paydunya.com/api/v1/softpay/new-orange-money-senegal';

console.log(`[PAYDUNYA] Mode utilisé: ${PAYDUNYA_MODE}`);

// ==========================================
// ENDPOINT CREATE ORDER (without PayDunya)
// ==========================================

// Créer une commande simple sans facture PayDunya (pour PixPay Orange Money)
app.post('/api/orders', async (req, res) => {
  try {
    const { supabase } = require('./supabase');
    const { buyer_id, product_id, vendor_id, total_amount, payment_method, buyer_phone, delivery_address } = req.body;

    console.log('[CREATE-ORDER-SIMPLE] Demande reçue:', { buyer_id, product_id, vendor_id, total_amount, payment_method });

    // Générer un order_code au format demandé: 'C' + 2 lettres + 4 chiffres (ex: CAB1234)
    const randLetter = () => String.fromCharCode(65 + Math.floor(Math.random()*26));
    const randLetters = (n) => Array.from({length:n}).map(() => randLetter()).join('');
    const randDigits = (n) => Math.floor(Math.random()*Math.pow(10,n)).toString().padStart(n,'0');
    const order_code = `C${randLetters(2)}${randDigits(4)}`;
    const crypto = require('crypto');
    const tokenRaw = crypto.randomBytes(8).toString('hex').toUpperCase();

    // Créer la commande dans Supabase (inclure le token sécurisé comme qr_code)
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        buyer_id,
        product_id,
        vendor_id,
        total_amount,
        status: 'pending',
        payment_method,
        buyer_phone,
        delivery_address,
        order_code,
        qr_code: tokenRaw,
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error('[CREATE-ORDER-SIMPLE] Erreur création commande:', orderError);
      return res.status(400).json({ 
        success: false, 
        message: orderError?.message || "Impossible de créer la commande" 
      });
    }

    console.log('[CREATE-ORDER-SIMPLE] Commande créée:', order.id);

    return res.json({ 
      success: true, 
      id: order.id, 
      order_id: order.id,
      order_code: order.order_code,
      qr_code: order.qr_code,
      message: 'Commande créée avec succès'
    });

  } catch (error) {
    console.error('[CREATE-ORDER-SIMPLE] Erreur inattendue:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur lors de la création de la commande' 
    });
  }
});

// ==========================================
// ENDPOINT GET BUYER ORDERS
// ==========================================
// Récupérer les commandes d'un acheteur (authentifié via Bearer token ou query param)
app.get('/api/buyer/orders', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let buyerId = req.query.buyer_id;
    let userId = null;

    // 1) Try JWT (SMS sessions)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && decoded.sub) {
          userId = decoded.sub;
        }
      } catch (e) {
        // not a JWT we issued, try Supabase
        try {
          const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
          if (!authErr && user) userId = user.id;
        } catch (e2) {
          // ignore
        }
      }
    }

    // fallback to buyer_id query param (dev/test)
    if (!userId && buyerId) userId = buyerId;

    if (!userId) return res.status(401).json({ success: false, error: 'Authentification requise (Bearer token ou buyer_id query param)' });

    console.log('[BUYER] fetching orders for buyer:', userId);

    // If service role key is available, use an admin client to bypass RLS and ensure
    // delivery/vendor profiles are always joined and visible. Otherwise fall back to
    // the normal supabase client (RLS-bound) but emit extra diagnostics.
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let orders = null;
    let queryError = null;
    try {
      if (serviceRoleKey) {
        const { createClient } = require('@supabase/supabase-js');
        const supabaseAdmin = createClient(process.env.SUPABASE_URL, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
        const q = await supabaseAdmin
          .from('orders')
          .select(`
            id, order_code, total_amount, status, vendor_id, product_id, created_at,
            product:products(id, name, price, description),
            vendor:profiles!orders_vendor_id_fkey(id, full_name, phone, wallet_type),
            delivery:profiles!orders_delivery_person_id_fkey(id, full_name, phone),
            qr_code, delivery_person_id
          `)
          .eq('buyer_id', userId)
          .order('created_at', { ascending: false });

        orders = q.data;
        queryError = q.error;
      } else {
        const q = await supabase
          .from('orders')
          .select(`
            id, order_code, total_amount, status, vendor_id, product_id, created_at,
            product:products(id, name, price, description),
            vendor:profiles!orders_vendor_id_fkey(id, full_name, phone, wallet_type),
            delivery:profiles!orders_delivery_person_id_fkey(id, full_name, phone),
            qr_code, delivery_person_id
          `)
          .eq('buyer_id', userId)
          .order('created_at', { ascending: false });

        orders = q.data;
        queryError = q.error;
      }
    } catch (e) {
      console.error('[BUYER] Exception fetching orders:', e);
      return res.status(500).json({ success: false, error: String(e) });
    }

    if (queryError) {
      console.error('[BUYER] Erreur récupération commandes:', queryError);
      return res.status(500).json({ success: false, error: queryError.message || 'Erreur serveur' });
    }

    // Diagnostics: if an order has delivery_person_id but no delivery profile joined,
    // log a warning to help trace whether delivery_person_id was not set or the join failed.
    try {
      const missingDelivery = (orders || []).filter(o => o.delivery_person_id && (!o.delivery || !o.delivery.id));
      if (missingDelivery.length > 0) {
        console.warn('[BUYER] Orders with delivery_person_id but missing delivery profile join count:', missingDelivery.length);
        // Log a sample (ids and delivery_person_id)
        console.warn('[BUYER] sample missingDelivery:', missingDelivery.slice(0,5).map(o => ({ id: o.id, delivery_person_id: o.delivery_person_id })));
      }
    } catch (diagErr) {
      console.warn('[BUYER] diagnostics failed:', diagErr?.message || diagErr);
    }

    return res.json({ success: true, orders: orders || [] , usingServiceRole: !!serviceRoleKey, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[BUYER] /api/buyer/orders error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// BUYER: Transactions liées aux commandes de l'acheteur
app.get('/api/buyer/transactions', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let buyerId = req.query.buyer_id;
    let userId = null;

    // 1) Try JWT (SMS sessions)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && decoded.sub) {
          userId = decoded.sub;
        }
      } catch (e) {
        // not a JWT we issued, try Supabase
        try {
          const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
          if (!authErr && user) userId = user.id;
        } catch (e2) {
          // ignore
        }
      }
    }

    // fallback to buyer_id query param (dev/test)
    if (!userId && buyerId) userId = buyerId;

    if (!userId) return res.status(401).json({ success: false, error: 'Authentification requise (Bearer token ou buyer_id query param)' });

    console.log('[BUYER] fetching transactions for buyer:', userId);

    // Récupérer les commandes de l'acheteur
    const { data: orderRows, error: ordersError } = await supabase
      .from('orders')
      .select('id')
      .eq('buyer_id', userId);

    if (ordersError) {
      console.error('[BUYER] Error fetching buyer orders for transactions:', ordersError);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }

    const orderIds = (orderRows || []).map(r => r.id).filter(Boolean);
    if (orderIds.length === 0) return res.json({ success: true, transactions: [] });

    const { data, error } = await supabase
      .from('payment_transactions')
      .select('*')
      .in('order_id', orderIds)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[BUYER] Error fetching transactions:', error);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }

    return res.json({ success: true, transactions: data || [] });
  } catch (err) {
    console.error('[BUYER] /api/buyer/transactions error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// ENDPOINT CREATE ORDER AND INVOICE
// ==========================================

// Créer une commande et générer une facture PayDunya en une seule requête
app.post('/api/payments/create-order-and-invoice', async (req, res) => {
  try {
    const { supabase } = require('./supabase');
    const { buyer_id, product_id, vendor_id, total_amount, payment_method, buyer_phone, delivery_address, description, storeName } = req.body;

    console.log('[CREATE-ORDER] Demande reçue:', { buyer_id, product_id, vendor_id, total_amount, payment_method });

    // Générer un order_code au format demandé: 'C' + 2 lettres + 4 chiffres (ex: CAB1234)
    const randLetter = () => String.fromCharCode(65 + Math.floor(Math.random()*26));
    const randLetters = (n) => Array.from({length:n}).map(() => randLetter()).join('');
    const randDigits = (n) => Math.floor(Math.random()*Math.pow(10,n)).toString().padStart(n,'0');

    let order_code;
    let attempts = 0;
    while (attempts < 10) {
      const candidate = `C${randLetters(2)}${randDigits(4)}`;
      const { data: existing, error: existingErr } = await supabase.from('orders').select('id').eq('order_code', candidate).limit(1);
      if (existingErr) {
        console.error('[CREATE-ORDER] Erreur vérification unicité order_code:', existingErr);
        order_code = candidate; // fallback
        break;
      }
      if (!existing || existing.length === 0) {
        order_code = candidate;
        break;
      }
      attempts++;
    }
    if (!order_code) {
      order_code = `C${randLetters(2)}${randDigits(4)}`; // dernière tentative
    }

    // 1. Créer la commande dans Supabase
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        buyer_id,
        product_id,
        vendor_id,
        total_amount,
        status: 'pending',
        payment_method,
        buyer_phone,
        delivery_address,
        order_code,
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error('[CREATE-ORDER] Erreur création commande:', orderError);
      return res.status(400).json({ status: 'failed', message: orderError?.message || "Impossible de créer la commande" });
    }

    console.log('[CREATE-ORDER] Commande créée:', order.id);

    // 2. Générer la facture PayDunya
    const invoiceResponse = await axios.post(`${PAYDUNYA_API_BASE}/checkout-invoice/create`, {
      invoice: {
        total_amount,
        description: description || `Commande ${order_code}`,
      },
      store: {
        name: storeName || 'Validèl',
      },
      actions: {
        cancel_url: process.env.PAYDUNYA_CANCEL_URL || 'https://validele.app/payment/cancel',
        return_url: process.env.PAYDUNYA_RETURN_URL || 'https://validele.app/payment/success',
        callback_url: process.env.PAYDUNYA_CALLBACK_URL || 'https://validele.onrender.com/api/paydunya/callback',
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'PAYDUNYA-MASTER-KEY': process.env.PAYDUNYA_MASTER_KEY,
        'PAYDUNYA-PRIVATE-KEY': process.env.PAYDUNYA_PRIVATE_KEY,
        'PAYDUNYA-TOKEN': process.env.PAYDUNYA_TOKEN,
      }
    });

    const invoiceData = invoiceResponse.data;
    console.log('[CREATE-ORDER] Réponse PayDunya:', invoiceData);

    if (invoiceData.response_code !== '00') {
      console.error('[CREATE-ORDER] Erreur PayDunya:', invoiceData);
      return res.status(400).json({ status: 'failed', message: invoiceData.response_text || "Erreur PayDunya" });
    }

    // 3. Mettre à jour la commande avec le token PayDunya (et laisser le qr_code sur le token sécurisé)
    await supabase
      .from('orders')
      .update({ token: invoiceData.token, qr_code: tokenRaw })
      .eq('id', order.id);

    console.log('[CREATE-ORDER] Token mis à jour pour commande', order.id);

    // 4. Retourner la réponse (inclure qr_code généré)
    return res.json({ 
      status: 'success', 
      redirect_url: invoiceData.response_text, 
      token: invoiceData.token, 
      receipt_url: invoiceData.receipt_url,
      order_id: order.id,
      qr_code: tokenRaw
    });

  } catch (error) {
    console.error('[CREATE-ORDER] Erreur:', error);
    return res.status(500).json({ status: 'failed', message: error.message });
  }
});

// Fonction pour formater le numéro de téléphone pour Orange Money Sénégal
// L'API PayDunya Orange Money attend le format local sénégalais (ex: 778676477)
function formatPhoneForOrangeMoney(phone) {
    if (!phone) return '';
    
    // Nettoyer le numéro (supprimer espaces, tirets, parenthèses)
    let cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    
    // Supprimer le préfixe +221 s'il existe
    if (cleanPhone.startsWith('+221')) {
        cleanPhone = cleanPhone.substring(4);
    }
    
    // Supprimer le préfixe 221 s'il existe
    if (cleanPhone.startsWith('221')) {
        cleanPhone = cleanPhone.substring(3);
    }
    
    // Vérifier que le numéro commence par 7 ou 3 (numéros mobiles sénégalais)
    if (cleanPhone.startsWith('7') || cleanPhone.startsWith('3')) {
        return cleanPhone;
    }
    
    // Si le numéro ne commence pas par 7 ou 3, l'assumer comme valide tel quel
    return cleanPhone;
}

// Créer une facture Wave (PayDunya)
app.post('/api/wave/create-invoice', async (req, res) => {
    try {
        const { invoice, store } = req.body;
        console.log('[CREATE-INVOICE] Body envoyé à PayDunya:', { invoice, store });
        const response = await axios.post(
            `${PAYDUNYA_API_BASE}/checkout-invoice/create`,
            { invoice, store },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'PAYDUNYA-MASTER-KEY': process.env.PAYDUNYA_MASTER_KEY,
                    'PAYDUNYA-PRIVATE-KEY': process.env.PAYDUNYA_PRIVATE_KEY,
                    'PAYDUNYA-TOKEN': process.env.PAYDUNYA_TOKEN
                }
            }
        );

        // Enregistrer le token dans la commande Supabase
        const token = response.data.token;
        let orderId = invoice.custom_data?.order_id;
        // Fallback si custom_data.order_id est null ou undefined
        if (!orderId && invoice.order_id) orderId = invoice.order_id;
        console.log('[CREATE-INVOICE] invoice:', invoice);
        console.log('[CREATE-INVOICE] invoice.custom_data:', invoice.custom_data);
        console.log('[CREATE-INVOICE] orderId utilisé pour update:', orderId);
        if (token && orderId) {
            const { supabase } = require('./supabase');
            await supabase
                .from('orders')
                .update({ token })
                .eq('id', orderId);
        }

        res.json(response.data);
    } catch (error) {
        console.error('Erreur lors de la création de la facture:', error);
        try { console.error('Erreur JSON:', JSON.stringify(error, null, 2)); } catch(e) {}
        try { console.error('Erreur toString:', error.toString()); } catch(e) {}
        try { console.error('Erreur stack:', error.stack); } catch(e) {}
        try { console.dir(error, { depth: 5 }); } catch(e) {}
        if (error.response) {
            console.error('PayDunya response.data:', error.response.data);
            console.error('PayDunya response.status:', error.response.status);
        }
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la création de la facture',
            error: error.response ? error.response.data : error.message
        });
    }
});

// Créer un paiement Wave (SOFTPAY API - Production)
app.post('/api/wave/make-payment', async (req, res) => {
    try {
        const { 
            wave_senegal_fullName, 
            wave_senegal_email, 
            wave_senegal_phone, 
            invoice_token,
            password // optionnel pour sandbox
        } = req.body;
        let response;
        if (PAYDUNYA_MODE === 'sandbox') {
            // Paiement test via endpoint sandbox
            response = await axios.post(
                'https://app.paydunya.com/sandbox-api/v1/checkout/make-payment',
                {
                    phone_number: wave_senegal_phone,
                    customer_email: wave_senegal_email,
                    password: password || 'Miliey@2121', // valeur par défaut pour test
                    invoice_token
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'PAYDUNYA-PRIVATE-KEY': process.env.PAYDUNYA_PRIVATE_KEY
                    }
                }
            );
        } else {
            // Paiement réel prod
            response = await axios.post(
                PAYDUNYA_SOFTPAY_WAVE,
                {
                    wave_senegal_fullName,
                    wave_senegal_email,
                    wave_senegal_phone,
                    wave_senegal_payment_token: invoice_token
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'PAYDUNYA-PRIVATE-KEY': process.env.PAYDUNYA_PRIVATE_KEY
                    }
                }
            );
        }
        res.json(response.data);
    } catch (error) {
        console.error('Erreur lors du paiement Wave SOFTPAY:', error?.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: 'Erreur lors du paiement Wave',
            error: error?.response?.data || error.message
        });
    }
});

// Créer un paiement Orange Money (SOFTPAY API - Production)
app.post('/api/orange-money/make-payment', async (req, res) => {
    try {
        const {
            orange_money_senegal_fullName,
            orange_money_senegal_email,
            orange_money_senegal_phone,
            invoice_token,
            password // optionnel pour sandbox
        } = req.body;
        
        // Formater le numéro de téléphone au format local sénégalais
        const formattedPhone = formatPhoneForOrangeMoney(orange_money_senegal_phone);
        console.log(`[ORANGE-MONEY] Numéro original: ${orange_money_senegal_phone}, formaté (local): ${formattedPhone}`);
        
        let response;
        if (PAYDUNYA_MODE === 'sandbox') {
            // Paiement test via endpoint sandbox (identique à Wave)
            response = await axios.post(
                'https://app.paydunya.com/sandbox-api/v1/checkout/make-payment',
                {
                    phone_number: formattedPhone,
                    customer_email: orange_money_senegal_email,
                    password: password || 'Miliey@2121',
                    invoice_token
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'PAYDUNYA-PRIVATE-KEY': process.env.PAYDUNYA_PRIVATE_KEY
                    }
                }
            );
        } else {
            // Paiement réel prod
            response = await axios.post(
                PAYDUNYA_SOFTPAY_OM,
                {
                    orange_money_senegal_fullName,
                    orange_money_senegal_email,
                    orange_money_senegal_phone: formattedPhone,
                    orange_money_senegal_payment_token: invoice_token
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'PAYDUNYA-PRIVATE-KEY': process.env.PAYDUNYA_PRIVATE_KEY
                    }
                }
            );
        }
        res.json(response.data);
    } catch (error) {
        console.error('Erreur lors du paiement Orange Money SOFTPAY:', error?.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: 'Erreur lors du paiement Orange Money',
            error: error?.response?.data || error.message
        });
    }
});

// Endpoint pour paiement Orange Money Sénégal par QR Code (nouvelle API)
app.post('/api/orange-money/qrcode', async (req, res) => {
  try {
    const { customer_name, customer_email, phone_number, invoice_token } = req.body;
    
    // Formater le numéro de téléphone au format local sénégalais
    const formattedPhone = formatPhoneForOrangeMoney(phone_number);
    console.log(`[ORANGE-MONEY-QR] Numéro original: ${phone_number}, formaté (local): ${formattedPhone}`);
    
    const response = await axios.post(
      PAYDUNYA_SOFTPAY_NEW_OM,
      {
        customer_name,
        customer_email,
        phone_number: formattedPhone,
        invoice_token,
        api_type: 'QRCODE'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'PAYDUNYA-PRIVATE-KEY': process.env.PAYDUNYA_PRIVATE_KEY
        }
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Erreur lors du paiement Orange Money QR Code:', error?.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du paiement Orange Money QR Code',
      error: error?.response?.data || error.message
    });
  }
});

// Endpoint pour paiement Orange Money Sénégal par OTP (nouvelle API)
app.post('/api/orange-money/otp', async (req, res) => {
  try {
    const { customer_name, customer_email, phone_number, authorization_code, invoice_token } = req.body;
    
    // Formater le numéro de téléphone au format local sénégalais
    const formattedPhone = formatPhoneForOrangeMoney(phone_number);
    console.log(`[ORANGE-MONEY-OTP] Numéro original: ${phone_number}, formaté (local): ${formattedPhone}`);
    
    const response = await axios.post(
      PAYDUNYA_SOFTPAY_NEW_OM,
      {
        customer_name,
        customer_email,
        phone_number: formattedPhone,
        authorization_code,
        invoice_token,
        api_type: 'OTPCODE'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'PAYDUNYA-PRIVATE-KEY': process.env.PAYDUNYA_PRIVATE_KEY
        }
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Erreur lors du paiement Orange Money OTP:', error?.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du paiement Orange Money OTP',
      error: error?.response?.data || error.message
    });
  }
});

// Endpoint pour réinitialiser le PIN via OTP (sécurisé côté serveur)
app.post('/api/auth/reset-pin', async (req, res) => {
  try {
    const { phone, code, newPin } = req.body || {};
    if (!phone || !code || !newPin) return res.status(400).json({ success: false, error: 'phone, code et newPin requis' });
    if (!/^[0-9]{4}$/.test(String(newPin))) return res.status(400).json({ success: false, error: 'newPin doit être 4 chiffres' });

    // Formatter le numéro
    let formattedPhone = String(phone).replace(/[\s\-\(\)]/g, '');
    if (!formattedPhone.startsWith('+')) {
      if (formattedPhone.startsWith('221')) formattedPhone = '+' + formattedPhone;
      else formattedPhone = '+221' + formattedPhone;
    }

    // Vérifier l'OTP côté serveur
    try {
      const otpRes = await verifyOTP(formattedPhone, String(code));
      if (!otpRes || !otpRes.valid) {
        return res.status(400).json({ success: false, error: 'OTP invalide' });
      }
    } catch (e) {
      console.error('[RESET-PIN] verifyOTP failed:', e);
      return res.status(400).json({ success: false, error: 'OTP invalide ou erreur fournisseur' });
    }

    // Chercher le profil (recherche tolerant sur les 9 derniers chiffres comme ailleurs)
    const digitsOnly = formattedPhone.replace(/\D/g, '');
    const last9 = digitsOnly.slice(-9);
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('id')
      .ilike('phone', `%${last9}%`)
      .limit(1);

    if (profErr) {
      console.error('[RESET-PIN] Erreur recherche profil:', profErr);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
    if (!profiles || profiles.length === 0) {
      return res.status(404).json({ success: false, error: 'Profil non trouvé' });
    }
    const profileId = profiles[0].id;

    // Hasher le PIN côté serveur (bcrypt)
    try {
      const bcrypt = require('bcryptjs');
      const hashed = await bcrypt.hash(String(newPin), 10);
      const { error: updateErr } = await supabase.from('profiles').update({ pin_hash: hashed }).eq('id', profileId);
      if (updateErr) {
        console.error('[RESET-PIN] Erreur update:', updateErr);
        return res.status(500).json({ success: false, error: 'Erreur sauvegarde PIN' });
      }
    } catch (e) {
      console.error('[RESET-PIN] Hash/update error:', e);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[RESET-PIN] Exception:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Webhook pour les notifications de paiement
app.post('/api/payment/webhook', async (req, res) => {
  console.log('Notification paiement reçue:', req.body);
  
  // Récupère le token de la facture dans la notification
  const token = req.body?.invoice_token || req.body?.token || req.body?.data?.invoice?.token;

  // Récupère le statut du paiement
  let status = req.body?.status || req.body?.data?.status || req.body?.payment_status;

  if (!token) {
    console.error('Token manquant dans la notification');
    return res.status(400).json({ error: 'Token manquant dans la notification' });
  }

  try {
    const { supabase } = require('./supabase');
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('id')
      .eq('token', token)
      .limit(1);

    if (fetchError || !orders || orders.length === 0) {
      console.error('Commande non trouvée pour ce token', fetchError);
      return res.status(400).json({ error: 'Commande non trouvée pour ce token' });
    }
    const orderId = orders[0].id;
    console.log('Commande trouvée pour ce token:', orderId);

    const { error } = await supabase
      .from('orders')
      .update({
        status: status === 'completed' || status === 'success' ? 'paid' : 'failed',
        payment_confirmed_at: new Date().toISOString()
      })
      .eq('id', orderId);

    console.log('Résultat update Supabase:', { error, orderId });

    if (error) {
      console.error('Erreur lors de la mise à jour de la commande dans Supabase:', error);
      return res.status(500).json({ error: 'Erreur lors de la mise à jour de la commande', details: error });
    }

    res.status(200).json({ message: 'ok' });
  } catch (err) {
    console.error('Erreur lors du traitement de la notification paiement:', err);
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
});

// Route de compatibilité pour les notifications PayDunya
// Certains fournisseurs vérifient l’accessibilité du callback via GET/HEAD
app.get('/api/paydunya/notification', (req, res) => {
  console.log('[WEBHOOK] GET /api/paydunya/notification – ping reçu');
  res.status(200).json({ success: true, message: 'Callback reachable' });
});

app.head('/api/paydunya/notification', (req, res) => {
  console.log('[WEBHOOK] HEAD /api/paydunya/notification – ping reçu');
  res.status(200).end();
});

app.post('/api/paydunya/notification', async (req, res) => {
  console.log('Notification paiement reçue:', req.body);

  const token = req.body?.invoice_token || req.body?.token || req.body?.data?.invoice?.token;
  let status = req.body?.status || req.body?.data?.status || req.body?.payment_status;

  console.log('Token extrait du webhook:', token);
  console.log('Statut reçu du webhook:', status);

  if (!token) {
    console.warn('[WEBHOOK] Token manquant dans la notification. Body reçu:', req.body, 'Headers:', req.headers);
    // En sandbox, on répond 200 pour éviter les 400 inutiles
    return res.status(200).json({ message: 'Notification reçue sans token (sandbox), ignorée.' });
  }

  try {
    const { supabase } = require('./supabase');
    let orders = [];
    let fetchError = null;
    // Recherche par token
    const res1 = await supabase
      .from('orders')
      .select('id, status, token')
      .eq('token', token)
      .limit(1);
    orders = res1.data;
    fetchError = res1.error;
    console.log('Résultat recherche commande par token:', { orders, fetchError });

    // Fallback : recherche par order_id si pas trouvé
    if ((!orders || orders.length === 0) && req.body?.order_id) {
      console.log('Aucune commande trouvée par token, tentative par order_id:', req.body.order_id);
      const res2 = await supabase
        .from('orders')
        .select('id, status, token')
        .eq('id', req.body.order_id)
        .limit(1);
      orders = res2.data;
      fetchError = res2.error;
      console.log('Résultat recherche commande par order_id:', { orders, fetchError });
    }

    if (fetchError || !orders || orders.length === 0) {
      console.error('Commande non trouvée pour ce token ni order_id', fetchError);
      return res.status(400).json({ error: 'Commande non trouvée pour ce token ni order_id' });
    }
    const orderId = orders[0].id;
    console.log('Commande trouvée pour ce token ou order_id:', orderId);

    const { error } = await supabase
      .from('orders')
      .update({
        status: status === 'completed' || status === 'success' ? 'paid' : 'failed',
        payment_confirmed_at: new Date().toISOString()
      })
      .eq('id', orderId);

    console.log('Résultat update Supabase:', { error, orderId });

    if (error) {
      console.error('Erreur lors de la mise à jour de la commande dans Supabase:', error);
      return res.status(500).json({ error: 'Erreur lors de la mise à jour de la commande', details: error });
    }

    res.status(200).json({ message: 'ok' });
  } catch (err) {
    console.error('Erreur lors du traitement de la notification paiement:', err);
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
});

// Route de succès de paiement avec confettis et facture téléchargeable
// Accessible en GET /paymentsuccess?order_id=<id>
// Note: some providers (PixPay/PayDunya) redirect to /payment-success (with hyphen).
// Add a small compatibility redirect to handle that.
app.get('/payment-success', (req, res) => {
  // preserve query string when redirecting
  const qs = req.originalUrl && req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  return res.redirect(302, '/paymentsuccess' + qs);
});

app.get('/paymentsuccess', (req, res) => {
  const orderId = req.query.order_id || '';
  const invoiceUrl = orderId ? `/api/orders/${orderId}/invoice` : '#';
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Paiement réussi</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; background: #f7fafc; margin: 0; padding: 0; }
    h1 { color: #2ecc40; margin-top: 60px; }
    .confetti { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 9999; }
    .btn { display: inline-block; margin-top: 30px; padding: 15px 30px; background: #2ecc40; color: #fff; border: none; border-radius: 8px; font-size: 1.2em; cursor: pointer; text-decoration: none; transition: background 0.2s; }
    .btn:hover { background: #27ae38; }
  </style>
</head>
<body>
  <canvas class="confetti"></canvas>
  <h1>🎉 Paiement réussi !</h1>
  <p>Merci pour votre commande.</p>
  <a id="invoiceLink" href="${invoiceUrl}" class="btn ${invoiceUrl === '#' ? 'disabled' : ''}" download>Télécharger la facture</a>
  <script>
    (function(){
      // Confetti animation (defensive)
      const canvas = document.querySelector('.confetti');
      const ctx = canvas.getContext && canvas.getContext('2d');
      if (!ctx) return; // defensive
      let W = window.innerWidth, H = window.innerHeight;
      canvas.width = W; canvas.height = H;
      function rand(min, max){ return Math.random()*(max-min)+min; }
      let confettis = Array.from({length:120}, () => ({ x: rand(0,W), y: rand(-H,0), r: 6 + Math.random()*8, d: 8 + Math.random()*8, color: 'hsl(' + (Math.random()*360) + ',90%,60%)', tilt: Math.random()*10 - 5 }));
      function draw(){ ctx.clearRect(0,0,W,H); confettis.forEach(c => { ctx.beginPath(); ctx.ellipse(c.x, c.y, c.r, c.r/2, c.tilt, 0, 2*Math.PI); ctx.fillStyle = c.color; ctx.fill(); }); update(); }
      function update(){ confettis.forEach(c => { c.y += Math.cos(c.d) + 2 + c.r/8; c.x += Math.sin(0.5) * 2; if (c.y > H) { c.x = Math.random() * W; c.y = -10; } }); }
      setInterval(draw, 16);
      window.addEventListener('resize', () => { W = window.innerWidth; H = window.innerHeight; canvas.width = W; canvas.height = H; });

      // Invoice lookup & auto-bind (if redirect doesn't include order_id)
      async function tryResolveOrder() {
        try {
          const params = new URLSearchParams(window.location.search);
          let orderId = params.get('order_id');
          const invoiceLink = document.getElementById('invoiceLink');

          function enable(linkHref) {
            invoiceLink.href = linkHref;
            invoiceLink.classList.remove('disabled');
            invoiceLink.setAttribute('download', 'invoice.html');
          }

          if (orderId && orderId !== '') {
            enable('/api/orders/' + orderId + '/invoice');
            return;
          }

          // Try transaction ids commonly used by providers
          const tx = params.get('transaction_id') || params.get('transaction') || params.get('txn') || params.get('provider_id') || params.get('provider_transaction_id');
          if (!tx) return;

          const lookup = await fetch('/api/payment/lookup?transaction_id=' + encodeURIComponent(tx));
          if (!lookup.ok) return;
          const data = await lookup.json();
          if (data && data.order_id) enable('/api/orders/' + data.order_id + '/invoice');
        } catch (e) {
          console.warn('Invoice lookup failed:', e);
        }
      }

      // On load try resolving
      tryResolveOrder();

    })();
  </script>
  <style>
    /* simple disabled style for button when invoice unavailable */
    .btn.disabled { opacity: 0.65; pointer-events: none; }
  </style>
</body>
</html>`);
});

// Public endpoint: download a simple HTML invoice for an order
app.get('/api/orders/:id/invoice', async (req, res) => {
  try {
    const orderId = req.params.id;
    if (!orderId) return res.status(400).send('order id required');

    // Ensure we have a supabase client (lazy-require if global not set)
    let sb = supabase;
    try {
      if (!sb) {
        const sbModule = require('./supabase');
        sb = sbModule && sbModule.supabase ? sbModule.supabase : sbModule;
        console.log('[INVOICE] Using lazy-loaded supabase client');
      }
    } catch (e) {
      console.error('[INVOICE] Failed to load supabase client:', e?.message || e);
      const accept = req.headers.accept || '';
      if (accept.includes('application/json')) return res.status(500).json({ success: false, error: 'Invoice service unavailable (DB client missing)' });
      return res.status(500).send('Invoice service unavailable (DB client missing)');
    }

    const { data: order, error } = await sb
      .from('orders')
      .select(`id, order_code, total_amount, created_at, buyer_id, vendor_id, product:products(name, code), buyer:profiles!orders_buyer_id_fkey(full_name, phone), vendor:profiles!orders_vendor_id_fkey(full_name, phone), delivery_address`)
      .eq('id', orderId)
      .maybeSingle();

    if (error) {
      console.error('[INVOICE] DB error when fetching order:', error);
      const accept = req.headers.accept || '';
      if (accept.includes('application/json')) return res.status(500).json({ success: false, error: 'DB error' });
      return res.status(500).send('Database error');
    }

    if (!order) {
      console.warn('[INVOICE] Order not found for id:', orderId);
      const accept = req.headers.accept || '';
      if (accept.includes('application/json')) return res.status(404).json({ success: false, error: 'Order not found' });
      return res.status(404).send('Order not found');
    }

    const rows = [{ order_code: order.order_code || order.id, gross: Number(order.total_amount || 0), commission: 0, net: Number(order.total_amount || 0) }];
    const totalGross = rows.reduce((s, r) => s + r.gross, 0);

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Facture - ${order.order_code || order.id}</title>
    <style>body{font-family: Arial, Helvetica, sans-serif; padding:20px;} table{width:100%; border-collapse:collapse} th,td{border:1px solid #ddd;padding:8px;text-align:left} th{background:#f5f5f5}</style>
  </head>
  <body>
    <h2>Facture - Commande ${order.order_code || order.id}</h2>
    <p><strong>Date:</strong> ${new Date(order.created_at || Date.now()).toLocaleString()}</p>
    <p><strong>Vendeur:</strong> ${order.vendor?.full_name || ''} ${order.vendor?.phone ? '('+order.vendor.phone+')' : ''}</p>
    <p><strong>Acheteur:</strong> ${order.buyer?.full_name || ''} ${order.buyer?.phone ? '('+order.buyer.phone+')' : ''}</p>
    <h3>Détails</h3>
    <table>
      <thead><tr><th>Commande</th><th>Brut (FCFA)</th></tr></thead>
      <tbody>
        ${rows.map(r => `<tr><td>${r.order_code}</td><td>${r.gross.toLocaleString()}</td></tr>`).join('')}
      </tbody>
      <tfoot>
        <tr><th>Total</th><th>${totalGross.toLocaleString()}</th></tr>
      </tfoot>
    </table>
    <p>Adresse livraison: ${order.delivery_address || '-'}</p>
    <p>Merci pour votre commande.</p>
  </body>
</html>`;

    const filename = `invoice-${order.order_code || order.id}.html`;
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(html);
  } catch (err) {
    console.error('[INVOICE] Error generating invoice:', err?.stack || err);
    const accept = req.headers.accept || '';
    if (accept.includes('application/json')) return res.status(500).json({ success: false, error: 'Internal server error generating invoice' });
    return res.status(500).send('Internal server error generating invoice');
  }
});

// Lookup endpoint: find order id from a provider/transaction id (used by /paymentsuccess to enable invoice download)
app.get('/api/payment/lookup', async (req, res) => {
  try {
    const { transaction_id, provider_id } = req.query || {};
    if (!transaction_id && !provider_id) return res.status(400).json({ success: false, error: 'transaction_id or provider_id required' });

    // Try to find a matching payment transaction
    try {
      const q = await supabase
        .from('payment_transactions')
        .select('order_id,transaction_id,provider_transaction_id')
        .or(
          transaction_id ? `transaction_id.eq.${transaction_id}` : 'transaction_id.is.null'
        )
        .limit(1);

      let rows = q.data || [];

      if ((!rows || rows.length === 0) && provider_id) {
        const q2 = await supabase
          .from('payment_transactions')
          .select('order_id,transaction_id,provider_transaction_id')
          .eq('provider_transaction_id', provider_id)
          .limit(1);
        rows = q2.data || [];
      }

      if (!rows || rows.length === 0) return res.status(404).json({ success: false, error: 'not_found' });

      return res.json({ success: true, order_id: rows[0].order_id || null, transaction: rows[0].transaction_id || rows[0].provider_transaction_id });
    } catch (err) {
      console.error('[LOOKUP] DB error:', err);
      return res.status(500).json({ success: false, error: String(err) });
    }
  } catch (err) {
    console.error('[LOOKUP] error:', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

const PORT = process.env.PORT || 5000;

// Sur Render/production, utiliser HTTP (Render gère le HTTPS)
// En local, essayer HTTPS si certificats disponibles
if (process.env.NODE_ENV === 'production' || !fs.existsSync('../localhost.key')) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HTTP server running on http://0.0.0.0:${PORT}`);
  });
} else {
  try {
    const key = fs.readFileSync('../localhost.key');
    const cert = fs.readFileSync('../localhost.crt');
    https.createServer({ key, cert }, app).listen(PORT, '0.0.0.0', () => {
      console.log(`HTTPS server running on https://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.warn('Erreur HTTPS, basculement en HTTP:', err.message);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`HTTP server running on http://0.0.0.0:${PORT}`);
    });
  }
}