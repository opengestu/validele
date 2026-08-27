// backend/scripts/seed-demo-catalog.js
// Crée (ou remet à jour) le VENDEUR et le PRODUIT de démonstration.
//
// Lancer : node backend/scripts/seed-demo-catalog.js
// Nécessite SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (backend/.env).
//
// IDEMPOTENT : relançable autant de fois que voulu. Le vendeur est retrouvé par
// son email, le produit par son code -> aucun doublon, aucune écriture destructive
// sur des données réelles (le script refuse d'écraser une ligne non marquée démo).
//
// Ce que ça crée :
//   - un compte auth + profil vendeur `is_demo = true`, connectable (pour montrer
//     le côté vendeur pendant une démo : commande reçue, QR scanné) ;
//   - un produit `is_demo = true` au code FIXE (backend/demo.js -> DEMO_PRODUCT_CODE),
//     visible UNIQUEMENT depuis un numéro de bot démo.
//
// Prérequis : migrations 008 et 009 appliquées.
const path = require('path');
// Chemin ABSOLU vers backend/.env : dotenv résout sinon `.env` depuis le dossier
// COURANT, donc lancer ce script depuis la racine du dépôt chargeait le `.env`
// racine (sans SUPABASE_SERVICE_ROLE_KEY). Ainsi le script marche quel que soit
// l'endroit d'où on l'appelle.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { DEMO_PRODUCT_CODE, DEMO_BOT_NUMBERS } = require('../demo');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Identité du vendeur de démo. Volontairement reconnaissable : personne ne doit
// pouvoir confondre ce vendeur avec un vrai commerçant dans le back-office.
const DEMO_VENDOR_EMAIL = process.env.DEMO_VENDOR_EMAIL || 'demo-vendeur@validel.shop';
const DEMO_VENDOR = {
  full_name: 'Boutique Démo Validèl',
  company_name: 'Boutique Démo Validèl',
  address: 'Sacré-Cœur 3, Dakar',
  // Numéro de démonstration, jamais appelé : préfixe 77 valide pour les
  // validations existantes, suffixe 00 00 00 clairement factice.
  phone: process.env.DEMO_VENDOR_PHONE || '+221770000000',
  role: 'vendor',
};
const DEMO_PRODUCT = {
  name: 'Caisse de yaourt (démonstration)',
  description: 'Produit de démonstration Validèl. Caisse de 12 pots de yaourt nature, fabrication locale.',
  price: Number(process.env.DEMO_PRODUCT_PRICE || 15000),
  warranty: null,
  is_available: true,
  stock_quantity: 999,
};

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const manquantes = [
      !SUPABASE_URL && 'SUPABASE_URL',
      !SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
    ].filter(Boolean).join(', ');
    fail(`Variable(s) manquante(s) : ${manquantes}\n   Attendues dans ${path.join(__dirname, '..', '.env')}`);
  }
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Garde-fou : sans la migration 009, tout ce script serait un no-op silencieux
  // qui créerait un vendeur et un produit RÉELS. On vérifie avant d'écrire.
  const { error: probeError } = await db.from('products').select('is_demo').limit(1);
  if (probeError) {
    fail(`Colonne products.is_demo introuvable — applique d'abord la migration 009 :\n   backend/migrations/009_add_demo_flags.sql\n   (${probeError.message})`);
  }

  // --- 1) Compte auth du vendeur démo ---------------------------------------
  // Mot de passe : fourni par l'env (stable, pratique pour se reconnecter) ou
  // généré et affiché une seule fois. Jamais écrit sur disque par le script.
  let password = process.env.DEMO_VENDOR_PASSWORD || null;
  let vendorId = null;
  let passwordIsNew = false;

  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email: DEMO_VENDOR_EMAIL,
    password: password || (password = `Demo#${crypto.randomBytes(9).toString('base64url')}`),
    email_confirm: true,
    user_metadata: {
      full_name: DEMO_VENDOR.full_name,
      phone: DEMO_VENDOR.phone,
      role: 'vendor',
      is_demo: true,
    },
  });

  if (created?.user?.id) {
    vendorId = created.user.id;
    passwordIsNew = true;
  } else if (createErr && (createErr.code === 'email_exists' || /exists/i.test(createErr.message || ''))) {
    // Déjà créé par un passage précédent : on le retrouve, on ne touche pas au
    // mot de passe existant (sauf DEMO_VENDOR_PASSWORD explicite, cf. plus bas).
    const { data: list, error: listErr } = await db.auth.admin.listUsers();
    if (listErr) fail(`Impossible de lister les comptes: ${listErr.message}`);
    const found = (list?.users || []).find((u) => u.email === DEMO_VENDOR_EMAIL);
    if (!found) fail(`Compte ${DEMO_VENDOR_EMAIL} signalé existant mais introuvable.`);
    vendorId = found.id;
    if (process.env.DEMO_VENDOR_PASSWORD) {
      const { error: updErr } = await db.auth.admin.updateUserById(vendorId, {
        password: process.env.DEMO_VENDOR_PASSWORD,
      });
      if (updErr) fail(`Mise à jour du mot de passe échouée: ${updErr.message}`);
      passwordIsNew = true;
    } else {
      password = null; // inchangé, on ne l'affiche pas
    }
  } else {
    fail(`Création du compte vendeur démo échouée: ${createErr && createErr.message}`);
  }

  // --- 2) Profil vendeur ----------------------------------------------------
  const { error: profileErr } = await db
    .from('profiles')
    .upsert({ id: vendorId, ...DEMO_VENDOR, is_demo: true }, { onConflict: 'id' });
  if (profileErr) fail(`Upsert du profil vendeur échoué: ${profileErr.message}`);

  // --- 3) Produit démo ------------------------------------------------------
  const { data: existing, error: lookupErr } = await db
    .from('products')
    .select('id, is_demo, vendor_id')
    .ilike('code', DEMO_PRODUCT_CODE)
    .maybeSingle();
  if (lookupErr) fail(`Lecture du produit démo échouée: ${lookupErr.message}`);

  // Sécurité : si un VRAI produit occupe déjà ce code, on s'arrête net plutôt que
  // de transformer le produit d'un vendeur en décor de démonstration.
  if (existing && existing.is_demo !== true) {
    fail(`Le code ${DEMO_PRODUCT_CODE} appartient déjà à un produit réel (id ${existing.id}).\n   Change DEMO_PRODUCT_CODE dans l'environnement, puis relance.`);
  }

  const productRow = { ...DEMO_PRODUCT, vendor_id: vendorId, code: DEMO_PRODUCT_CODE, is_demo: true };
  const { error: productErr } = existing
    ? await db.from('products').update(productRow).eq('id', existing.id)
    : await db.from('products').insert(productRow);
  if (productErr) fail(`Écriture du produit démo échouée: ${productErr.message}`);

  // --- Récapitulatif --------------------------------------------------------
  const demoNumber = DEMO_BOT_NUMBERS[0];
  console.log(`
✅ Catalogue de démonstration prêt.

   Vendeur   ${DEMO_VENDOR.company_name}
   Email     ${DEMO_VENDOR_EMAIL}
   Mot de passe  ${passwordIsNew ? password : '(inchangé — défini lors d\'un passage précédent)'}
   Produit   ${DEMO_PRODUCT.name} — ${DEMO_PRODUCT.price.toLocaleString('fr-FR')} FCFA
   Code      ${DEMO_PRODUCT_CODE}   (invisible depuis le numéro de prod)

   Pour lancer une démo : écrire « ${DEMO_PRODUCT_CODE} » au ${demoNumber ? `+${demoNumber}` : 'numéro démo'}
   ou partager  https://www.validel.shop/demo/${DEMO_PRODUCT_CODE}
${passwordIsNew && !process.env.DEMO_VENDOR_PASSWORD ? '\n   ⚠️ Ce mot de passe n\'est affiché qu\'une fois. Note-le, ou fixe DEMO_VENDOR_PASSWORD\n      dans l\'environnement et relance ce script pour le redéfinir.\n' : ''}`);
}

main().catch((e) => fail(e && e.message ? e.message : String(e)));
