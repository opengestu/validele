import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function createSupabaseClientFromEnv(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Variables d\'environnement manquantes pour Supabase. ' +
      'Veuillez définir SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (voir backend/.env.example).'
    );
  }

  return createClient(supabaseUrl, supabaseKey);
}

let supabase: SupabaseClient | null = null;

try {
  supabase = createSupabaseClientFromEnv();
} catch (error) {
  if (process.env.NODE_ENV === 'production') {
    throw error;
  }
  const message = error instanceof Error ? error.message : String(error);
  // En dev, on laisse le serveur démarrer: les routes DB échoueront clairement si appelées.
  console.warn(message);
}

export function getSupabaseClient(): SupabaseClient {
  if (supabase) return supabase;
  // Permet aussi de recharger si les variables d'env sont ajoutées après coup.
  supabase = createSupabaseClientFromEnv();
  return supabase;
}

// Exemple de type pour une commande
export interface Order {
  id: string;
  amount?: number; // optionnel pour compatibilité
  total_amount: number;
  sellerId?: string; // optionnel pour compatibilité
  vendor_id: string;
  status: string;
}

// Exemple de type pour un utilisateur/vendeur
export interface User {
  id: string;
  phone: string;
  walletType: string; // 'wave-senegal' ou 'orange-senegal'
}

// Exemple de type pour une transaction
export interface Transaction {
  id: string;
  orderId: string;
  status: string;
  paydunyaTransactionId?: string;
}

// Récupérer une commande par ID
export async function getOrderById(orderId: string): Promise<Order | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();
  if (error || !data) return null;
  return data as Order;
}

// Récupérer un utilisateur/vendeur par ID
export async function getUserById(userId: string): Promise<User | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return data as User;
}

// Mettre à jour le statut d'une transaction
export async function updateTransactionStatus(transactionId: string, status: string): Promise<void> {
  // TODO: Remplacer par update réel dans la base de données
} 