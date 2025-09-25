import { createClient } from '@supabase/supabase-js';

// Remplace par tes infos Supabase
const SUPABASE_URL = 'https://TON-PROJET.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'TA_CLE_SERVICE_ROLE';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function migrateProductCodes() {
  // 1. Récupérer tous les produits
  const { data: products, error } = await supabase
    .from('products')
    .select('id, vendor_id, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Erreur lors de la récupération des produits:', error);
    return;
  }

  // 2. Grouper par vendeur
  const byVendor: Record<string, { id: string; created_at: string }[]> = {};
  for (const p of products!) {
    if (!byVendor[p.vendor_id]) byVendor[p.vendor_id] = [];
    byVendor[p.vendor_id].push({ id: p.id, created_at: p.created_at });
  }

  // 3. Pour chaque vendeur, numéroter et mettre à jour les codes
  for (const [vendorId, prods] of Object.entries(byVendor)) {
    for (let i = 0; i < prods.length; i++) {
      const code = `pv${i.toString().padStart(3, '0')}`;
      const { error: updateError } = await supabase
        .from('products')
        .update({ code })
        .eq('id', prods[i].id);

      if (updateError) {
        console.error(`Erreur MAJ produit ${prods[i].id}:`, updateError);
      } else {
        console.log(`Produit ${prods[i].id} => code ${code}`);
      }
    }
  }

  console.log('Migration terminée !');
}

migrateProductCodes();
