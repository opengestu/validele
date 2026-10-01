const crypto = require('crypto');

function createReceiptCodes(secret) {
  if (!secret) throw new Error('Receipt code secret required');
  const attempts = new Map();
  const sign = value => crypto.createHmac('sha256', secret).update(value).digest('hex');
  const codeFor = order => String(parseInt(sign(`receipt:${order.id}:${order.qr_code}`).slice(0, 8), 16) % 10000).padStart(4, '0');
  function check(order, code, now = Date.now()) {
    if (!order.qr_code || !/^\d{4}$/.test(String(code || ''))) return { ok: false, status: 400 };
    for (const [id, entry] of attempts) if (entry.until <= now) attempts.delete(id);
    const entry = attempts.get(order.id) || { count: 0, until: now + 15 * 60 * 1000 };
    if (entry.count >= 5) return { ok: false, status: 429 };
    if (code !== codeFor(order)) {
      entry.count++;
      attempts.set(order.id, entry);
      return { ok: false, status: 403 };
    }
    return { ok: true };
  }
  function proofFor(orderId, actorId, now = Date.now()) {
    const payload = Buffer.from(JSON.stringify({ orderId, actorId, expires: now + 5 * 60 * 1000 })).toString('base64url');
    return `${payload}.${sign(`proof:${payload}`)}`;
  }
  function verifyProof(proof, orderId, actorId, now = Date.now()) {
    try {
      const [payload, signature] = String(proof || '').split('.');
      const expected = sign(`proof:${payload}`);
      if (signature?.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
      return data.orderId === orderId && data.actorId === actorId && data.expires > now;
    } catch { return false; }
  }
  return { codeFor, check, proofFor, verifyProof };
}
module.exports = { createReceiptCodes };
