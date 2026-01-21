// Server endpoint for POST /api/notify/delivery-started
// This file is a production-ready example (Next.js API handler and an Express-compatible handler helper).

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY as string | undefined; // service role key required for server
const D7_API_KEY = process.env.D7_API_KEY_NOTIFY as string | undefined;
const D7_SMS_URL = process.env.D7_SMS_URL || 'https://api.direct7networks.com/sms/send';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn('SUPABASE_URL or SUPABASE_SERVICE_KEY not set. Some server features may not work locally.');
}

const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_KEY || '');

async function sendD7SMS(to: string, text: string) {
  if (!D7_API_KEY) throw new Error('D7_API_KEY not configured');
  const res = await fetch(D7_SMS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${D7_API_KEY}`,
    },
    body: JSON.stringify({ to, text }),
  });
  const json = await res.json().catch(() => ({ status: res.status }));
  return { ok: res.ok, status: res.status, body: json };
}

type NotifyRequestBody = {
  buyerId?: string;
  orderId?: string;
  orderCode?: string;
  deliveryPersonPhone?: string;
};

export async function notifyDeliveryHandler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { buyerId, orderId, orderCode, deliveryPersonPhone } = (req.body || {}) as NotifyRequestBody;
    if (!buyerId && !orderId) return res.status(400).json({ success: false, error: 'buyerId or orderId required' });

    // Resolve phone numbers from DB when not provided
    let buyerPhone: string | null = null;
    let dpPhone: string | null = deliveryPersonPhone || null;

    if (buyerId) {
      const { data: buyer, error: buyerErr } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', buyerId)
        .maybeSingle();
      if (buyerErr) throw buyerErr;
      buyerPhone = buyer?.phone || null;
    }

    if ((!dpPhone || !buyerPhone) && orderId) {
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('buyer_id, delivery_person_id')
        .eq('id', orderId)
        .maybeSingle();
      if (orderErr) throw orderErr;

      if (!buyerPhone && order?.buyer_id) {
        const { data: buyer2, error: buyer2Err } = await supabase
          .from('profiles')
          .select('phone')
          .eq('id', order.buyer_id)
          .maybeSingle();
        if (buyer2Err) throw buyer2Err;
        buyerPhone = buyer2?.phone || null;
      }

      if (!dpPhone && order?.delivery_person_id) {
        const { data: dp, error: dpErr } = await supabase
          .from('profiles')
          .select('phone')
          .eq('id', order.delivery_person_id)
          .maybeSingle();
        if (!dpErr) dpPhone = dp?.phone || null;
      }
    }

    if (!buyerPhone) return res.status(400).json({ success: false, error: 'Buyer phone not found' });

    const message = `Votre commande${orderCode ? ' ' + orderCode : ''} est en cours de livraison. Numéro du livreur : ${dpPhone ?? 'non disponible'}`;

    // Dry-run support (do not call D7 when X-Dry-Run header is set)
    const dryRunHeader = req.headers['x-dry-run'];
    const dryRun = dryRunHeader === '1' || dryRunHeader === 'true' || (Array.isArray(dryRunHeader) && dryRunHeader.includes('1'));

    let sendResult: { ok: boolean; status: number; body: unknown };

    if (dryRun) {
      sendResult = { ok: true, status: 0, body: { dryRun: true, message } };
    } else {
      // Send SMS (simple attempt, log result)
      try {
        sendResult = await sendD7SMS(buyerPhone, message);
      } catch (err) {
        console.error('sendD7SMS error', err);
        sendResult = { ok: false, status: 0, body: String(err) };
      }
    }

    // Log in sms_logs table for traceability
    try {
      await supabase.from('sms_logs').insert([{ order_id: orderId || null, to: buyerPhone, text: message, provider_response: sendResult.body || null, status: sendResult.ok ? 'sent' : 'failed', created_at: new Date().toISOString() }]);
    } catch (logErr) {
      console.warn('Failed to log sms to sms_logs:', logErr);
    }

    if (!sendResult.ok) {
      return res.status(500).json({ success: false, sent: false, detail: sendResult.body });
    }

    return res.status(200).json({ success: true, sent: true, detail: sendResult.body });
  } catch (error) {
    console.error('notify-delivery-started error', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
}

// Default export for Next.js API handler
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return notifyDeliveryHandler(req, res);
}
