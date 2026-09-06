// Lecture seule : aucune affirmation du client ou réponse IA ne fait foi.
const normalize = (text) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function concernsPayment(text) {
  return /\b(pai\w*|pay\w*|regl\w*|vers\w*|vire\w*|debit\w*|credit\w*|encaiss\w*|rembours\w*|transaction\w*|argent|fonds|somme|money|paid|payment|transfert\w*)\b/.test(normalize(text));
}

async function readPaymentStatus(db, { phone, text, productCode }) {
  if (!db) throw new Error('Base indisponible');
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const orderCode = String(text || '').toUpperCase().match(/\b[A-Z]{3}\d{4}\b/)?.[0];
  // Le numéro du message authentifié reste obligatoire, même avec un code fourni.
  let query = db.from('orders').select('id, order_code, status, payment_confirmed_at, total_amount')
    .in('buyer_phone', [digits, `+${digits}`]).eq('is_demo', false);
  if (orderCode) query = query.eq('order_code', orderCode);
  else if (productCode) {
    const product = await db.from('products').select('id').eq('code', productCode).maybeSingle();
    if (product.error) throw product.error;
    if (!product.data) return null;
    query = query.eq('product_id', product.data.id);
  }
  const orders = await query.order('created_at', { ascending: false }).limit(2);
  if (orders.error) throw orders.error;
  if (!orders.data?.length) return null;
  if (orders.data.length !== 1) return { ambiguous: true };
  const order = orders.data[0];
  const transactions = await db.from('payment_transactions')
    .select('status, amount, transaction_type, provider').eq('order_id', order.id);
  if (transactions.error) throw transactions.error;
  const payments = (transactions.data || []).filter(t =>
    ['pixpay_wave', 'pixpay_orange', 'pixpay'].includes(t.provider)
    && (t.transaction_type == null || t.transaction_type === 'payment')
    && Number(t.amount) === Number(order.total_amount));
  const confirmed = Boolean(order.payment_confirmed_at)
    && ['paid', 'in_delivery', 'delivered'].includes(order.status)
    && payments.some(t => t.status === 'SUCCESSFUL');
  const failed = !order.payment_confirmed_at && payments.length > 0
    && payments.every(t => t.status === 'FAILED');
  return { code: order.order_code, confirmed, failed };
}

async function paymentReply(readStatus, context) {
  try {
    const result = await readStatus(context);
    if (result?.ambiguous) return 'Plusieurs commandes correspondent. Envoyez le code de la commande avec votre demande de vérification du paiement.';
    if (!result) return 'Je ne retrouve pas de commande à vérifier pour votre numéro. Envoyez le code de votre commande avec votre demande de vérification du paiement.';
    if (result.confirmed) return `Le paiement de la commande ${result.code} est confirmé dans notre système.`;
    if (result.failed) return `Le paiement de la commande ${result.code} est enregistré en échec. Si votre compte a été débité, contactez le support Validèl avec la référence de transaction avant de réessayer.`;
    return `Le paiement de la commande ${result.code} n’est pas confirmé dans notre système. Attendez la confirmation officielle. Si votre compte a été débité, contactez le support Validèl avec la référence de transaction avant de réessayer.`;
  } catch {
    return 'La vérification du paiement est momentanément indisponible. Je ne peux pas confirmer sa réception. Si votre compte a été débité, contactez le support Validèl avant de réessayer.';
  }
}

module.exports = { concernsPayment, readPaymentStatus, paymentReply };
