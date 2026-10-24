function protectionRate(data, env = process.env) {
  const raw = data?.protection_fee_pct ?? env.VALIDEL_COMMISSION_PCT ?? 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('Frais de protection invalides');
  return value;
}
async function readProtectionRate(db, env = process.env) {
  if (!db) throw new Error('Configuration des frais indisponible');
  const { data, error } = await db.from('payout_settings').select('*').eq('id', 1).single();
  if (error) throw new Error('Configuration des frais indisponible');
  return protectionRate(data, env);
}
module.exports = { protectionRate, readProtectionRate };
