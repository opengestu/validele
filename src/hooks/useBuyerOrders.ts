import { useQuery } from '@tanstack/react-query';
import { apiUrl, getProfileById, safeJson } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { Order } from '@/types/database';

interface UseBuyerOrdersOpts {
  buyerId?: string | null;
  enabled?: boolean;
}

export default function useBuyerOrders({ buyerId, enabled = true }: UseBuyerOrdersOpts) {
  return useQuery<Order[], Error>({
    queryKey: ['buyerOrders', buyerId],
    queryFn: async () => {
      if (!buyerId) return [];
      const smsSessionStr = typeof window !== 'undefined' ? localStorage.getItem('sms_auth_session') : null;
      const sms = smsSessionStr ? JSON.parse(smsSessionStr || '{}') : null;
      let token = sms?.access_token || sms?.token || sms?.jwt || '';
      if (!token) {
        try {
          const sessRes = await supabase.auth.getSession();
          const sess = sessRes.data?.session ?? null;
          token = sess?.access_token || '';
        } catch (e) {
          token = '';
        }
      }

      const url = apiUrl(`/api/buyer/orders?buyer_id=${buyerId}`);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const resp = await fetch(url, { method: 'GET', headers });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || !json.success) {
        throw new Error((json && json.error) ? String(json.error) : `Backend returned ${resp.status}`);
      }

      let data = json.orders || [];
      // Normalisation similaire à BuyerDashboard
      data = (data || []).map((o: any) => ({
        ...o,
        profiles: o.profiles || o.vendor || null,
        delivery_person: o.delivery_person || o.delivery || null,
        products: o.products || o.product || null,
        qr_code: o.qr_code || o.token || null,
      }));

      const allowedStatus = ['paid', 'in_delivery', 'delivered', 'refunded', 'cancelled'];
      let normalizedOrders = (data || [])
        .filter((o: any) => typeof o.status === 'string' && allowedStatus.includes(o.status))
        .map((o: any) => ({
          ...o,
          delivery_person_id: o.delivery_person_id ?? undefined,
          assigned_at: o.assigned_at ?? undefined,
          delivered_at: o.delivered_at ?? undefined,
        })) as Order[];

      // Enrich with missing profiles if necessary (best effort)
      try {
        const missingVendorIds = Array.from(new Set(normalizedOrders.filter(o => !o.profiles && o.vendor_id).map(o => String(o.vendor_id))));
        const missingDeliveryIds = Array.from(new Set(normalizedOrders.filter(o => !o.delivery_person && o.delivery_person_id).map(o => String(o.delivery_person_id))));

        const fetchProfilesMap = async (ids: string[]) => {
          const map: Record<string, any> = {};
          await Promise.all(ids.map(async (id) => {
            try {
              const { ok, json } = await getProfileById(id);
              if (ok && json) {
                const profile = (json.profile ?? json) as any;
                if (profile && profile.id) map[id] = profile;
              }
            } catch (e) {
              // ignore
            }
          }));
          return map;
        };

        const vendorMap = missingVendorIds.length > 0 ? await fetchProfilesMap(missingVendorIds) : {};
        const deliveryMap = missingDeliveryIds.length > 0 ? await fetchProfilesMap(missingDeliveryIds) : {};

        normalizedOrders = normalizedOrders.map(o => {
          const copy = { ...o } as any;
          if (!copy.profiles && copy.vendor_id && vendorMap[String(copy.vendor_id)]) {
            copy.profiles = vendorMap[String(copy.vendor_id)];
          }
          if (!copy.delivery_person && copy.delivery_person_id && deliveryMap[String(copy.delivery_person_id)]) {
            copy.delivery_person = deliveryMap[String(copy.delivery_person_id)];
          }
          return copy as Order;
        });
      } catch (e) {
        // ignore
      }

      // Save a localStorage fallback (kept for compatibility)
      try {
        localStorage.setItem(`cached_buyer_orders_${buyerId}`, JSON.stringify({ orders: normalizedOrders, ts: Date.now() }));
      } catch (e) {
        // ignore
      }

      return normalizedOrders;
    },
    enabled: Boolean(buyerId) && enabled,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
}
