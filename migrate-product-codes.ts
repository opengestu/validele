import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://TON-PROJET.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'TA_CLE_SERVICE_ROLE';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function migrateProductCodes() {
  const { data: products, error } = await supabase
    .from('products')
    .select('id, vendor_id, created_at')
    .order('created_at', { ascending: true });

  if (error || !products) {
    console.error('Erreur lors de la récupération des produits:', error);
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byVendor = new Map<string, any[]>();
  for (const p of products) {
    if (!byVendor.has(p.vendor_id)) byVendor.set(p.vendor_id, []);
    byVendor.get(p.vendor_id)!.push(p);
  }

  for (const [vendorId, prods] of byVendor.entries()) {
    for (let i = 0; i < prods.length; i++) {
      if (i > 9999) throw new Error('Limite de 9999 produits atteinte pour ce vendeur');
      const code = `pv${i.toString().padStart(4, '0')}`.toLowerCase();
      // ... update logic ...
    }
  }

  console.log('Migration terminée !');
}

migrateProductCodes(); 