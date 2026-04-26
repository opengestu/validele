 
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { apiUrl } from '@/lib/api';
import useNetwork from '@/hooks/useNetwork';
import AdminLoginForm from '@/components/AdminLoginForm';

type Order = {
  id: string;
  order_code?: string;
  total_amount?: number;
  status?: string;
  vendor_id?: string;
  delivery_address?: string;
  payout_status?: string | null;
  payout_requested_at?: string | null;
  payout_requested_by?: string | null;
  payout_paid_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

type Transaction = {
  id: string;
  transaction_id?: string;
  order_id?: string;
  batch_id?: string | null;
  amount?: number;
  status?: string;
  transaction_type?: string;
  provider_transaction_id?: string | null;
  provider_response?: Record<string, unknown> | null;
  raw_response?: Record<string, unknown> | null;
  created_at?: string;
};

// Extended types used in admin dashboard
type ProfileRef = {
  id: string;
  full_name?: string;
  phone?: string;
  wallet_type?: string | null;
  address?: string | null;
};

// Module-level helpers (exported so they can be used by nested components/modals)
function displayProfileName(p?: ProfileRef | null, fallback?: string) {
  if (!p) return fallback || '-';
  return p.full_name || (p as any).name || `${(p as any).first_name || ''} ${(p as any).last_name || ''}`.trim() || p.phone || fallback || '-';
}

function displayProfileAddress(p?: ProfileRef | null, fallback?: string) {
  if (!p) return fallback || '-';
  return p.address || fallback || p.phone || '-';
}

function displayOrderPerson(o: any, role: 'buyer' | 'vendor' | 'delivery') {
  try {
    const p = role === 'buyer' ? o.buyer : role === 'vendor' ? o.vendor : o.delivery;
    const orderLevelName = (o as any)[`${role}_full_name`] || (o as any)[`${role}_name`];
    if (orderLevelName) return String(orderLevelName);
    return displayProfileName(p, undefined);
  } catch (e) {
    return '-';
  }
}

function displayOrderAddress(o: any) {
  return (o && (o.buyer?.address || o.delivery_address)) || displayProfileAddress(o?.buyer) || '-';
}

type OrderFull = Order & {
  buyer?: ProfileRef | null;
  vendor?: ProfileRef | null;
  delivery?: ProfileRef | null;
  buyer_id?: string | null;
  vendor_id?: string | null;
  delivery_person_id?: string | null;
};

type TransactionFull = Transaction & {
  order?: { id: string; order_code?: string } | null;
};

type Timer = {
  id: string;
  order?: { id: string; order_code?: string } | null;
  started_at: string;
  duration_seconds: number;
  message?: string | null;
  active?: boolean;
  started_by?: string | null;
};

// Payout batches & items (for scheduled/manual mass payouts)
type PayoutBatch = {
  id: string;
  created_by?: string | null;
  scheduled_at?: string;
  processed_at?: string | null;
  status?: 'scheduled' | 'processing' | 'completed' | 'failed' | 'cancelled';
  total_amount?: number;
  commission_pct?: number | null;
  notes?: string | null;
  created_at?: string;
};

type PayoutBatchItem = {
  id: string;
  batch_id?: string;
  order_id?: string | null;
  vendor_id?: string | null;
  vendor?: ProfileRef | null;
  amount?: number;
  commission_pct?: number | null;
  commission_amount?: number | null;
  net_amount?: number | null;
  status?: 'queued' | 'processing' | 'paid' | 'failed';
  provider_transaction_id?: string | null;
  provider_response?: Record<string, unknown> | null;
  created_at?: string;
  order?: { id: string; order_code?: string } | null;
};

// Admin transfers (withdrawals from Pixpay)
type AdminTransfer = {
  id: string;
  amount?: number;
  phone?: string;
  wallet_type?: 'wave-senegal' | 'orange-senegal';
  note?: string | null;
  status?: string;
  provider_transaction_id?: string | null;
  provider_response?: Record<string, unknown> | null;
  created_by?: string | null;
  created_at?: string;
};

// Refund requests
type RefundRequest = {
  id: string;
  order_id?: string;
  buyer_id?: string;
  amount?: number;
  reason?: string | null;
  status?: 'pending' | 'approved' | 'rejected' | 'processed';
  requested_at?: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  processed_at?: string | null;
  transaction_id?: string | null;
  rejection_reason?: string | null;
  order?: { id: string; order_code?: string; payment_method?: string; products?: { name?: string } } | null;
  buyer?: ProfileRef | null;
};

type CommissionRow = {
  payoutItemId: string;
  batchId: string;
  orderId: string;
  orderCode: string;
  vendorName: string;
  grossAmount: number;
  commissionRate: number;
  commissionAmount: number;
  vendorNetAmount: number;
  status: string;
  createdAt?: string;
};

const moneyValue = (value?: number | null): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const formatFcfa = (amount: number) => `${Math.round(amount).toLocaleString('fr-FR')} FCFA`;

const AdminDashboard: React.FC = () => {
  const { toast } = useToast();
  const { session, loading: authLoading, signOut } = useAuth();
  const [orders, setOrders] = useState<OrderFull[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [batches, setBatches] = useState<PayoutBatch[]>([]);
  const [batchItems, setBatchItems] = useState<PayoutBatchItem[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<PayoutBatch | null>(null);
  const [selectedBatchItems, setSelectedBatchItems] = useState<PayoutBatchItem[]>([]);
  const [batchDetailsOpen, setBatchDetailsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'orders'|'transactions'|'payouts'|'payouts_history'|'commissions'|'transfers'|'refunds'>('orders');

  // Admin transfers state
  const [transfers, setTransfers] = useState<AdminTransfer[]>([]);
  
  // Refunds state
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferPhone, setTransferPhone] = useState('');
  const [transferWalletType, setTransferWalletType] = useState<'wave-senegal' | 'orange-senegal'>('wave-senegal');
  const [transferNote, setTransferNote] = useState('');
  const [transferProcessing, setTransferProcessing] = useState(false);

  // Background refresh helpers
  const isRefreshingRef = React.useRef(false);
  const shallowOrdersEqual = (a: OrderFull[] = [], b: OrderFull[] = []) => {
    try {
      if ((a || []).length !== (b || []).length) return false;
      const aKey = (a || []).map(x => `${x.id}:${x.status}`).sort().join('|');
      const bKey = (b || []).map(x => `${x.id}:${x.status}`).sort().join('|');
      return aKey === bKey;
    } catch (e) { return false; }
  };
  const shallowTransactionsEqual = (a: Transaction[] = [], b: Transaction[] = []) => {
    try {
      if ((a || []).length !== (b || []).length) return false;
      const aKey = (a || []).map(x => `${x.id}:${x.status || ''}:${x.order_id || ''}`).sort().join('|');
      const bKey = (b || []).map(x => `${x.id}:${x.status || ''}:${x.order_id || ''}`).sort().join('|');
      return aKey === bKey;
    } catch (e) { return false; }
  };
  // Admin login state - DOIT ÊTRE DÉCLARÉ AVANT LES useEffect
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminSessionChecked, setAdminSessionChecked] = useState(false);

  // Transaction details modal state
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionFull | null>(null);
  const [txDetailsOpen, setTxDetailsOpen] = useState(false);
  const [retryingTxId, setRetryingTxId] = useState<string | null>(null);

  // Batch details modal state
  const [selectedVendorForInvoice, setSelectedVendorForInvoice] = useState<string | null>(null);
  
  // Invoice viewer modal state (pour afficher les factures avec authentification)
  const [invoiceViewerOpen, setInvoiceViewerOpen] = useState(false);
  const [invoiceViewerHtml, setInvoiceViewerHtml] = useState<string | null>(null);
  const [invoiceViewerTitle, setInvoiceViewerTitle] = useState<string>('');
  const [invoiceViewerLoading, setInvoiceViewerLoading] = useState(false);
  const [invoiceViewerFilename, setInvoiceViewerFilename] = useState<string | null>(null);

  // Broadcast notification to all vendors
  const [broadcastNotifyOpen, setBroadcastNotifyOpen] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Vérifier la session admin au chargement/refresh.
  // On attend que l'auth Supabase soit hydratée pour pouvoir fallback sur le Bearer token
  // quand les cookies cross-site ne sont pas renvoyés par le navigateur.
  useEffect(() => {
    if (authLoading) {
      setAdminSessionChecked(false);
      return;
    }

    let cancelled = false;

    const checkAdminSession = async () => {
      setAdminSessionChecked(false);
      try {
        let res = await fetch(apiUrl('/api/admin/validate'), {
          credentials: 'include'
        });

        if (!res.ok && session?.access_token) {
          res = await fetch(apiUrl('/api/admin/validate'), {
            method: 'GET',
            credentials: 'include',
            headers: { Authorization: `Bearer ${session.access_token}` }
          });
        }

        if (cancelled) return;

        if (res.ok) {
          setIsAuthenticated(true);
          setShowAdminLogin(false);
        } else {
          setIsAuthenticated(false);
          setShowAdminLogin(true);
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Erreur vérification session:', error);
        setIsAuthenticated(false);
        setShowAdminLogin(true);
      } finally {
        if (!cancelled) setAdminSessionChecked(true);
      }
    };

    checkAdminSession();

    return () => {
      cancelled = true;
    };
  }, [authLoading, session?.access_token]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Background polling (silent): reduced cadence to avoid server/log saturation.
  useEffect(() => {
    if (!isAuthenticated) return;
    let ordersInterval: any = null;
    let txInterval: any = null;

    // initial silent snapshot
    fetchOrdersOnly({ silent: true });
    fetchTransactionsOnly({ silent: true });

    ordersInterval = setInterval(async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (isRefreshingRef.current) return;
      isRefreshingRef.current = true;
      try {
        await fetchOrdersOnly({ silent: true });
      } catch (e) {
        console.warn('[AdminDashboard] background orders refresh failed', e);
      } finally {
        isRefreshingRef.current = false;
      }
    }, 10000);

    txInterval = setInterval(async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        await fetchTransactionsOnly({ silent: true });
      } catch (e) {
        console.warn('[AdminDashboard] background transactions refresh failed', e);
      }
    }, 15000);

    return () => {
      try { if (ordersInterval) clearInterval(ordersInterval); } catch (e) {}
      try { if (txInterval) clearInterval(txInterval); } catch (e) {}
    };
  }, [isAuthenticated]);

  // Fetch missing buyer/vendor/delivery profiles for orders that lack nested profile details
  useEffect(() => {
    if (!isAuthenticated || !orders || orders.length === 0) return;
    let cancelled = false;
    const missing = new Set<string>();
    for (const o of orders) {
      if ((!o.buyer || !o.buyer.full_name) && o.buyer_id) missing.add(String(o.buyer_id));
      if ((!o.vendor || !o.vendor.full_name) && o.vendor_id) missing.add(String(o.vendor_id));
      if ((!o.delivery || !o.delivery.full_name) && o.delivery_person_id) missing.add(String(o.delivery_person_id));
    }
    if (missing.size === 0) return;

    (async () => {
      try {
        const ids = Array.from(missing).join(',');
        const res = await fetch(apiUrl(`/api/admin/profiles?ids=${encodeURIComponent(ids)}`), { headers: getAuthHeader(), credentials: 'include' });
        if (!res.ok) return;
        const json = await res.json();
        const profiles = (json.profiles || []) as any[];
        const map = new Map(profiles.map(p => [p.id, p]));
        if (cancelled) return;
        const updated = orders.map(o => {
          const copy = { ...o } as OrderFull;
          if ((!copy.buyer || !copy.buyer.full_name) && copy.buyer_id && map.has(copy.buyer_id)) copy.buyer = map.get(copy.buyer_id);
          if ((!copy.vendor || !copy.vendor.full_name) && copy.vendor_id && map.has(copy.vendor_id)) copy.vendor = map.get(copy.vendor_id);
          if ((!copy.delivery || !copy.delivery.full_name) && copy.delivery_person_id && map.has(copy.delivery_person_id)) copy.delivery = map.get(copy.delivery_person_id);
          return copy;
        });
        setOrders(updated);
      } catch (e) {
        console.warn('[AdminDashboard] fetch missing profiles failed', e);
      }
    })();

    return () => { cancelled = true; };
  }, [orders, isAuthenticated]);

  const getAuthHeader = (): HeadersInit => {
    if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
    return {};
  };

  // Helper: safely extract provider_id from a raw provider response object
  const getProviderId = (raw?: Record<string, unknown> | null): string | undefined => {
    try {
      if (!raw || typeof raw !== 'object') return undefined;

      // 1) Check nested `data.provider_id` shape
      const maybeData = (raw as { data?: unknown }).data;
      if (maybeData && typeof maybeData === 'object' && 'provider_id' in (maybeData as Record<string, unknown>)) {
        const pid = (maybeData as Record<string, unknown>)['provider_id'];
        return pid == null ? undefined : String(pid);
      }

      // 2) Direct `provider_id` on root
      if ('provider_id' in (raw as Record<string, unknown>)) {
        const pid = (raw as Record<string, unknown>)['provider_id'];
        return pid == null ? undefined : String(pid);
      }

      return undefined;
    } catch {
      return undefined;
    }
  };

  // Transaction statuses mapping and helper for badge classes
  // Include Pixpay statuses: PENDING1, PENDING2, SUCCESSFUL, SUCCESS, FAILED
  const TX_STATUS_LABELS_FR: Record<string, string> = {
    pending: 'En attente',
    queued: 'En file',
    processing: 'En cours',
    paid: 'Payée',
    failed: 'Échouée',
    cancelled: 'Annulée',
    // Pixpay statuses
    // Treat PENDING1 as a success (Pixpay uses PENDING1 for completed transfers in some cases)
    PENDING1: 'Réussie ✓',
    PENDING2: 'En attente',
    SUCCESSFUL: 'Réussie ✓',
    SUCCESS: 'Réussie ✓',
    FAILED: 'Échouée'
  };
  
  // Normalize status for consistent display
  const normalizeStatus = (s?: string): string => {
    const st = String(s || '').toUpperCase();
    // In Pixpay, PENDING1 indicates a completed transfer in some flows; treat it as paid
    if (st === 'SUCCESSFUL' || st === 'SUCCESS' || st === 'PENDING1') return 'paid';
    if (st === 'PENDING2') return 'pending';
    if (st === 'FAILED') return 'failed';
    return String(s || '').toLowerCase();
  };
  
  const txStatusClass = (s?: string) => {
    const st = normalizeStatus(s);
    if (st === 'pending' || st === 'queued') return 'bg-yellow-100 text-yellow-800';
    if (st === 'processing') return 'bg-blue-100 text-blue-800';
    if (st === 'paid' || st === 'confirmed') return 'bg-green-100 text-green-800';
    if (st === 'failed' || st === 'error') return 'bg-red-100 text-red-800';
    if (st === 'cancelled') return 'bg-slate-200 text-slate-600';
    return 'bg-slate-100 text-slate-700';
  };

  // Note: PIN-based admin login has been disabled for security reasons. The legacy PIN flow is blocked server-side for admin profiles.
  // The submitPinAsAdmin function and related local PIN UI states were intentionally removed.


  const isOnline = useNetwork();

  const handleLogout = async () => {
    let serverLogoutOk = false;
    try {
      const res = await fetch(apiUrl('/api/admin/logout'), {
        method: 'POST',
        headers: getAuthHeader(),
        credentials: 'include'
      });
      serverLogoutOk = res.ok;
    } catch (error) {
      console.error('Erreur déconnexion:', error);
    }

    try {
      // Ensure client-side Supabase session is removed so refresh cannot re-auth via bearer fallback.
      await signOut();
    } catch (error) {
      console.error('Erreur déconnexion Supabase:', error);
    }

    // Nettoyer le state et le localStorage
    try {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_orders');
      localStorage.removeItem('admin_transactions');
    } catch(e) { /* ignore */ }

    setIsAuthenticated(false);
    setShowAdminLogin(true);
    setOrders([]);
    setTransactions([]);
    setBatches([]);
    setRefunds([]);
    setTransfers([]);

    toast({
      title: 'Déconnecté',
      description: serverLogoutOk
        ? 'Vous avez été déconnecté avec succès'
        : 'Session locale fermée. Reconnectez-vous pour continuer.'
    });
  };

  // Ouvrir une facture dans une modal avec authentification admin
  const openInvoiceInModal = async (url: string, title = 'Facture') => {
    try {
      setInvoiceViewerLoading(true);
      setInvoiceViewerTitle(title);
      setInvoiceViewerHtml(null);
      setInvoiceViewerFilename(null);
      const authHeaders = getAuthHeader();
      const headers: Record<string,string> = {
        'Accept': 'text/html, */*'
      };
      if (authHeaders && typeof authHeaders === 'object') Object.assign(headers, authHeaders);

      const tryFetch = async (candidate: string) => {
        const full = candidate.startsWith('http') ? candidate : apiUrl(candidate);
        try {
          const r = await fetch(full, { method: 'GET', headers, credentials: 'include' });
          return { resp: r, url: full };
        } catch (e) {
          return { resp: null as unknown as Response, url: full, err: e };
        }
      };

      // First attempt: use provided URL as-is
      let attempt = await tryFetch(url);

      // If 404, try common alternative parameter names / path variants used by different backends
      if (!attempt.resp || attempt.resp.status === 404) {
        // try swap query param vendorId -> vendor_id and vendor
        const qIdx = url.indexOf('?');
        const base = qIdx >= 0 ? url.slice(0, qIdx) : url;
        const qs = qIdx >= 0 ? url.slice(qIdx + 1) : '';
        const params = new URLSearchParams(qs);
        const vendorVal = params.get('vendorId') || params.get('vendor_id') || params.get('vendor');

        const candidates: string[] = [];
        // replace vendorId param name
        if (vendorVal) {
          const baseQs = params.toString();
          candidates.push(`${base}?vendor_id=${encodeURIComponent(vendorVal)}`);
          candidates.push(`${base}?vendor=${encodeURIComponent(vendorVal)}`);
          // path param variant
          candidates.push(`${base}/${encodeURIComponent(vendorVal)}`);
        }
        // also try vendorId query with different casing
        if (params.get('vendorId')) {
          candidates.push(`${base}?vendorId=${encodeURIComponent(params.get('vendorId') || '')}`);
        }

        for (const c of candidates) {
          attempt = await tryFetch(c);
          if (attempt.resp && attempt.resp.ok) break;
        }
      }

      if (!attempt.resp) throw new Error('Aucun serveur réponse');

      const resp = attempt.resp;

      if (!resp.ok) {
        if (resp.status === 403 || resp.status === 401) {
          toast({ title: 'Non autorisé', description: 'Session admin expirée. Veuillez vous reconnecter.', variant: 'destructive' });
          setIsAuthenticated(false);
          setShowAdminLogin(true);
          return;
        }
        throw new Error(`Erreur ${resp.status}`);
      }

      const text = await resp.text();
      let filename = 'invoice.html';
      const cd = resp.headers.get('content-disposition') || '';
      const m = /filename\s*=\s*"?([^;"]+)"?/i.exec(cd);
      if (m && m[1]) filename = m[1];

      setInvoiceViewerFilename(filename);
      setInvoiceViewerHtml(text);
      setInvoiceViewerOpen(true);
    } catch (err) {
      console.error('[AdminDashboard] openInvoiceInModal error', err);
      toast({ 
        title: 'Erreur', 
        description: 'Impossible d\'ouvrir la facture', 
        variant: 'destructive' 
      });
    } finally {
      setInvoiceViewerLoading(false);
    }
  };

  // Télécharger une facture batch en fichier (PDF/XLSX)
  const downloadInvoiceFile = async (url: string, fallbackFilename: string) => {
    try {
      const authHeaders = getAuthHeader();
      const headers: Record<string,string> = {
        'Accept': 'application/pdf, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/octet-stream, */*'
      };
      if (authHeaders && typeof authHeaders === 'object') Object.assign(headers, authHeaders);

      const full = url.startsWith('http') ? url : apiUrl(url);
      const resp = await fetch(full, { method: 'GET', headers, credentials: 'include' });

      if (!resp.ok) {
        if (resp.status === 403 || resp.status === 401) {
          toast({ title: 'Non autorisé', description: 'Session admin expirée. Veuillez vous reconnecter.', variant: 'destructive' });
          setIsAuthenticated(false);
          setShowAdminLogin(true);
          return;
        }
        throw new Error(`Erreur ${resp.status}`);
      }

      const blob = await resp.blob();
      if (!blob || blob.size === 0) throw new Error('Fichier vide');

      let filename = fallbackFilename;
      const cd = resp.headers.get('content-disposition') || '';
      const m = /filename\s*=\s*"?([^;"]+)"?/i.exec(cd);
      if (m && m[1]) filename = m[1];

      const objUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(objUrl);

      toast({ title: 'Téléchargé', description: `Fichier ${filename} sauvegardé` });
    } catch (err) {
      console.error('[AdminDashboard] downloadInvoiceFile error', err);
      toast({
        title: 'Erreur',
        description: 'Impossible de télécharger la facture',
        variant: 'destructive'
      });
    }
  };

  // Télécharger la facture visible dans la modal
  const downloadVisibleInvoice = () => {
    try {
      if (!invoiceViewerHtml) return;
      const blob = new Blob([invoiceViewerHtml], { type: 'text/html' });
      const urlObj = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = urlObj;
      a.download = invoiceViewerFilename || 'invoice.html';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(urlObj);
      toast({ title: 'Téléchargé', description: 'Facture sauvegardée' });
    } catch (err) {
      console.error('[AdminDashboard] download error', err);
      toast({ title: 'Erreur', description: 'Erreur lors du téléchargement', variant: 'destructive' });
    }
  };

  // Filtrer les données selon la recherche
  const filterOrders = (orders: OrderFull[]) => {
    if (!searchQuery.trim()) return orders;
    const q = searchQuery.toLowerCase();
    return orders.filter(o => 
      o.order_code?.toLowerCase().includes(q) ||
      o.id?.toLowerCase().includes(q) ||
      o.buyer?.full_name?.toLowerCase().includes(q) ||
      o.buyer?.phone?.toLowerCase().includes(q) ||
      o.vendor?.full_name?.toLowerCase().includes(q) ||
      o.vendor?.phone?.toLowerCase().includes(q) ||
      o.delivery?.full_name?.toLowerCase().includes(q) ||
      o.status?.toLowerCase().includes(q) ||
      o.payout_status?.toLowerCase().includes(q)
    );
  };

  const filterTransactions = (transactions: Transaction[]) => {
    if (!searchQuery.trim()) return transactions;
    const q = searchQuery.toLowerCase();
    return transactions.filter(t => 
      t.id?.toLowerCase().includes(q) ||
      t.transaction_id?.toLowerCase().includes(q) ||
      t.order_id?.toLowerCase().includes(q) ||
      t.batch_id?.toLowerCase().includes(q) ||
      t.provider_transaction_id?.toLowerCase().includes(q) ||
      t.status?.toLowerCase().includes(q) ||
      t.transaction_type?.toLowerCase().includes(q)
    );
  };

  const filterBatches = (batches: PayoutBatch[]) => {
    if (!searchQuery.trim()) return batches;
    const q = searchQuery.toLowerCase();
    return batches.filter(b => 
      b.id?.toLowerCase().includes(q) ||
      b.status?.toLowerCase().includes(q) ||
      b.created_by?.toLowerCase().includes(q)
    );
  };

  const filterTransfers = (transfers: AdminTransfer[]) => {
    if (!searchQuery.trim()) return transfers;
    const q = searchQuery.toLowerCase();
    return transfers.filter(t => 
      t.id?.toLowerCase().includes(q) ||
      t.phone?.toLowerCase().includes(q) ||
      t.wallet_type?.toLowerCase().includes(q) ||
      t.status?.toLowerCase().includes(q) ||
      t.note?.toLowerCase().includes(q) ||
      t.provider_transaction_id?.toLowerCase().includes(q)
    );
  };

  const filterRefunds = (refunds: RefundRequest[]) => {
    if (!searchQuery.trim()) return refunds;
    const q = searchQuery.toLowerCase();
    return refunds.filter(r => 
      r.id?.toLowerCase().includes(q) ||
      r.order_id?.toLowerCase().includes(q) ||
      r.buyer_id?.toLowerCase().includes(q) ||
      r.order?.order_code?.toLowerCase().includes(q) ||
      r.buyer?.full_name?.toLowerCase().includes(q) ||
      r.buyer?.phone?.toLowerCase().includes(q) ||
      r.status?.toLowerCase().includes(q) ||
      r.reason?.toLowerCase().includes(q) ||
      r.rejection_reason?.toLowerCase().includes(q)
    );
  };

  const filterCommissionRows = (rows: CommissionRow[]) => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter(r =>
      r.batchId.toLowerCase().includes(q) ||
      r.orderId.toLowerCase().includes(q) ||
      r.orderCode.toLowerCase().includes(q) ||
      r.vendorName.toLowerCase().includes(q) ||
      r.status.toLowerCase().includes(q)
    );
  };

  const commissionOverview = useMemo(() => {
    const ordersMap = new Map((orders || []).map((o) => [o.id, o]));

    let totalCommission = 0;
    let commissionPaid = 0;
    let commissionPending = 0;
    let commissionFailed = 0;
    const rows: CommissionRow[] = [];

    for (const item of batchItems || []) {
      const grossAmount = moneyValue(item.amount);
      const itemAmount = moneyValue(item.amount);
      const commissionRate = moneyValue(item.commission_pct);
      const inferredCommission = itemAmount > 0 && commissionRate > 0 ? (itemAmount * commissionRate) / 100 : 0;
      const commissionAmount = moneyValue(item.commission_amount) || inferredCommission;
      if (commissionAmount <= 0) continue;

      const vendorNetAmount = moneyValue(item.net_amount) || Math.max(itemAmount - commissionAmount, 0);
      const itemStatus = String(item.status || 'queued').toLowerCase();
      const orderId = item.order_id || item.order?.id || '-';
      const linkedOrder = ordersMap.get(orderId);
      const vendorFromItem = displayProfileName(item.vendor, '');
      const vendorFromOrder = linkedOrder ? displayOrderPerson(linkedOrder, 'vendor') : '';

      totalCommission += commissionAmount;

      if (itemStatus === 'paid') {
        commissionPaid += commissionAmount;
      } else if (itemStatus === 'failed') {
        commissionFailed += commissionAmount;
      } else {
        commissionPending += commissionAmount;
      }

      rows.push({
        payoutItemId: item.id,
        batchId: item.batch_id || '-',
        orderId,
        orderCode: item.order?.order_code || linkedOrder?.order_code || '-',
        vendorName: vendorFromItem || vendorFromOrder || '-',
        grossAmount,
        commissionRate,
        commissionAmount,
        vendorNetAmount,
        status: itemStatus,
        createdAt: item.created_at
      });
    }

    const rowsSorted = rows.slice().sort((a, b) => {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    const averageRate = rows.length > 0 ? rows.reduce((sum, r) => sum + r.commissionRate, 0) / rows.length : 0;
    const averageCommission = rows.length > 0 ? totalCommission / rows.length : 0;

    return {
      payoutsWithCommission: rows.length,
      totalCommission,
      commissionPaid,
      commissionPending,
      commissionFailed,
      averageRate,
      averageCommission,
      rows: rowsSorted
    };
  }, [batchItems, orders]);

  // Profile display helpers are defined at module top and reused here.

  // Helper: determine if a refund is truly pending (unreviewed and unprocessed)
  // A refund is pending ONLY if:
  // - status is 'pending' (not 'approved', 'processed', or 'rejected')
  // - AND reviewed_at is null (hasn't been reviewed by admin yet)
  // If reviewed_at exists, refund has been processed (approved or rejected) regardless of other fields
  const isRefundPending = (r: RefundRequest) => {
    // If reviewed_at is set, refund was definitely reviewed - it's in history
    if (r.reviewed_at) return false;
    
    // Only show in pending section if status is 'pending' and has never been reviewed
    return r.status === 'pending';
  };

  const handleApproveRefund = async (refundId: string) => {
    setProcessing(true);
    try {
      console.log('[AdminDashboard] Approving refund:', refundId);
      
      const res = await fetch(apiUrl(`/api/admin/refund-requests/${refundId}/approve`), {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      
      console.log('[AdminDashboard] Approve response status:', res.status);
      const json = await res.json();
      console.log('[AdminDashboard] Approve response:', json);
      
      if (!res.ok) {
        throw new Error(json?.error || `Erreur lors de l\'approbation (${res.status})`);
      }
      
      // If backend returns provider info or tx id, surface it to the admin for debugging
      const providerId = json?.transaction_id || json?.provider_transaction_id || (json?.transaction && (json.transaction as any).provider_transaction_id) || getProviderId(json?.provider_response as any);

      toast({ 
        title: providerId ? '✅ Remboursement approuvé — transaction envoyée' : '✅ Remboursement approuvé', 
        description: providerId ? `Provider TX: ${providerId} — Mise à jour des données...` : 'Le remboursement a été traité avec succès. Mise à jour des données...',
      });

      // Reload immediately to get updated data from backend and transactions
      console.log('[AdminDashboard] Fetching updated data and transactions...');
      await Promise.all([fetchData(), fetchTransactionsOnly()]);

      // Also reload after delay to ensure backend fully processed
      setTimeout(() => {
        console.log('[AdminDashboard] Fetching data again after delay...');
        fetchData();
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[AdminDashboard] Approve error:', message);
      toast({ 
        title: 'Erreur lors de l\'approbation', 
        description: message, 
        variant: 'destructive' 
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectRefund = async (refundId: string, reason: string) => {
    setProcessing(true);
    try {
      console.log('[AdminDashboard] Rejecting refund:', refundId, 'reason:', reason);
      
      const res = await fetch(apiUrl(`/api/admin/refund-requests/${refundId}/reject`), {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason })
      });
      
      console.log('[AdminDashboard] Reject response status:', res.status);
      const json = await res.json();
      console.log('[AdminDashboard] Reject response:', json);
      
      if (!res.ok) {
        throw new Error(json?.error || `Erreur lors du rejet (${res.status})`);
      }
      
      toast({ 
        title: '✅ Demande rejetée', 
        description: 'La demande de remboursement a été rejetée. Mise à jour des données...' 
      });
      
      // Reload immediately to get updated data from backend
      console.log('[AdminDashboard] Fetching updated data...');
      await fetchData();
      
      // Also reload after delay to ensure backend fully processed
      setTimeout(() => {
        console.log('[AdminDashboard] Fetching data again after delay...');
        fetchData();
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[AdminDashboard] Reject error:', message);
      toast({ 
        title: 'Erreur lors du rejet', 
        description: message, 
        variant: 'destructive' 
      });
    } finally {
      setProcessing(false);
    }
  };

  // Fetch only orders (supports silent option to avoid unnecessary rerenders)
  const fetchOrdersOnly = async (opts?: { silent?: boolean }) => {
    try {
      const headers = getAuthHeader();
      const oRes = await fetch(apiUrl('/api/admin/orders'), { headers, credentials: 'include' });
      if (oRes.status === 401) {
        setIsAuthenticated(false);
        setShowAdminLogin(true);
        return;
      }
      const oJson = await oRes.json();
      if (oRes.ok) {
        const fetchedOrders = oJson.orders || [];
        if (!opts?.silent) {
          setOrders(fetchedOrders);
          try { localStorage.setItem('admin_orders', JSON.stringify(fetchedOrders)); } catch(e) { /* ignore cache errors */ }
        } else {
          if (!shallowOrdersEqual(orders, fetchedOrders)) setOrders(fetchedOrders);
        }
      }
    } catch (error) {
      console.warn('[AdminDashboard] fetchOrdersOnly error', error);
    }
  };

  // Fetch only transactions (supports silent option); merges orders-as-transactions like fetchData
  const fetchTransactionsOnly = async (opts?: { silent?: boolean }) => {
    try {
      const headers = getAuthHeader();
      const tRes = await fetch(apiUrl('/api/admin/transactions'), { headers, credentials: 'include' });
      if (tRes.status === 401) {
        setIsAuthenticated(false);
        setShowAdminLogin(true);
        return;
      }
      const tJson = await tRes.json();
      if (tRes.ok) {
        const serverTxs = tJson.transactions || [] as Transaction[];
        // use current orders as fallback to synthesize missing txs
        const ordersList = orders || [];
        const txByOrder = new Set((serverTxs as Transaction[]).map((tx) => tx.order_id));
        const ordersAsTxs = ordersList.filter((o: Order) => !txByOrder.has(o.id)).map((o: Order) => ({
          id: `order-${o.id}`,
          order_id: o.id,
          amount: o.total_amount,
          status: o.payout_status || o.status || 'pending',
          transaction_type: 'payout',
          order: { id: o.id, order_code: o.order_code },
          created_at: ((o as { updated_at?: string }).updated_at) || o.created_at
        }));
        const merged = [...(serverTxs as Transaction[]), ...ordersAsTxs];
        if (!opts?.silent) {
          setTransactions(merged);
          try { localStorage.setItem('admin_transactions', JSON.stringify(merged)); } catch(e) { /* ignore cache errors */ }
        } else {
          if (!shallowTransactionsEqual(transactions, merged)) setTransactions(merged);
        }
      }
    } catch (error) {
      console.warn('[AdminDashboard] fetchTransactionsOnly error', error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchOrdersOnly(), fetchTransactionsOnly()]);

      const headers = getAuthHeader();
      const batchesRes = await fetch(apiUrl('/api/admin/payout-batches'), { headers, credentials: 'include' });
      const refundsRes = await fetch(apiUrl('/api/admin/refund-requests'), { headers, credentials: 'include' });

      const batchesJson = await batchesRes.json();
      const refundsJson = refundsRes.ok ? await refundsRes.json() : { refunds: [] };

      if (batchesRes.ok) {
        setBatches(batchesJson.batches || []);
        setBatchItems(batchesJson.items || []);
      }

      // Set refunds
      if (refundsRes.ok) {
        setRefunds(refundsJson.refunds || []);
      }

      // Fetch admin transfers
      try {
        const transfersRes = await fetch(apiUrl('/api/admin/transfers'), { headers, credentials: 'include' });
        if (transfersRes.ok) {
          const transfersJson = await transfersRes.json();
          setTransfers(transfersJson.transfers || []);
        }
      } catch (e) {
        console.warn('Failed to fetch transfers:', e);
      }
    } catch (error) {
      // Try to load cached admin data when offline
      try {
        const cachedOrders = localStorage.getItem('admin_orders');
        const cachedTrans = localStorage.getItem('admin_transactions');
        let used = false;
        if (cachedOrders) { setOrders(JSON.parse(cachedOrders)); used = true; }
        if (cachedTrans) { setTransactions(JSON.parse(cachedTrans)); used = true; }
        if (used) {
          toast({ title: 'Hors-ligne', description: 'Affichage des données admin en cache' });
          return;
        }
      } catch (e) {
        // ignore
      }

      toast({ title: 'Erreur', description: 'Impossible de charger les données admin', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const startTimer = async (orderId: string, durationSeconds: number, message?: string) => {
    try {
      const res = await fetch(apiUrl('/api/admin/start-timer'), {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ orderId, durationSeconds, message })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Erreur démarrage timer');
      toast({ title: 'Succès', description: 'Timer démarré' });
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err || 'Erreur démarrage timer');
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    }
  };


  const notifyUser = async (userId: string | undefined, title: string, body: string) => {
    if (!userId) return toast({ title: 'Erreur', description: 'Utilisateur introuvable', variant: 'destructive' });
    try {
      const res = await fetch(apiUrl('/api/admin/notify'), {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ userId, title, body })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Erreur notify');
      toast({ title: 'Succès', description: 'Notification envoyée' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err || 'Erreur notify');
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    }
  };

  const sendBroadcastNotification = async () => {
    if (!broadcastTitle.trim() || !broadcastBody.trim()) {
      return toast({ title: 'Erreur', description: 'Titre et message requis', variant: 'destructive' });
    }
    setBroadcastSending(true);
    try {
      const res = await fetch(apiUrl('/api/admin/notify-all-vendors'), {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ title: broadcastTitle, body: broadcastBody })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Erreur envoi notification');
      toast({ 
        title: 'Succès', 
        description: `Notification envoyée à ${json.sent} vendeur(s)` 
      });
      setBroadcastNotifyOpen(false);
      setBroadcastTitle('');
      setBroadcastBody('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err || 'Erreur envoi');
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setBroadcastSending(false);
    }
  };

  // Open transaction details modal
  const openTxDetails = (tx: TransactionFull) => {
    setSelectedTransaction(tx);
    setTxDetailsOpen(true);
  };

  // Retry a transaction (ask server to reprocess / requeue)
  const retryTransaction = async (txId: string) => {
    setRetryingTxId(txId);
    try {
      const res = await fetch(apiUrl(`/api/admin/transactions/${txId}/retry`), {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Erreur relance transaction');
      toast({ title: 'Succès', description: 'Relance de la transaction demandée' });
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err || 'Erreur relance');
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setRetryingTxId(null);
    }
  };

  const handlePayout = async (orderId: string) => {
    setProcessing(true);
    try {
      // 1) verify eligibility (server-side authoritative check)
      const verifyRes = await fetch(apiUrl('/api/admin/verify-and-payout'), {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, body: JSON.stringify({ orderId, execute: false })
      });
      const verifyJson = await verifyRes.json();

      if (!verifyRes.ok) throw new Error(verifyJson.error || 'Erreur vérification');

      const report = verifyJson.report;
      if (!report || !report.eligible) {
        const reasons = (report && report.reasons && report.reasons.length) ? report.reasons.join(', ') : 'Non éligible selon règles internes';
        toast({ title: 'Non éligible', description: `Payout bloqué: ${reasons}`, variant: 'destructive' });
        return;
      }

      // 2) confirm with admin
      if (!confirm('Confirmer le paiement au vendeur pour cette commande ?')) return;

      // 3) execute payout
      const execRes = await fetch(apiUrl('/api/admin/verify-and-payout'), {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, body: JSON.stringify({ orderId, execute: true })
      });
      const execJson = await execRes.json();
      if (!execRes.ok) throw new Error(execJson.error || 'Erreur exécution payout');

      toast({ title: 'Succès', description: 'Payout initié (processing).' });
      fetchData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error || 'Erreur lors du payout');
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  // Evite tout affichage du dashboard avant la fin de la vérification de session admin.
  if (authLoading || !adminSessionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="flex items-center gap-3 text-slate-700">
          <Spinner className="h-5 w-5" />
          <span>Vérification de la session admin...</span>
        </div>
      </div>
    );
  }

  if (showAdminLogin) {
    return (
      <AdminLoginForm
        onSuccess={() => {
          setIsAuthenticated(true);
          setShowAdminLogin(false);
          setAdminSessionChecked(true);
          fetchData();
        }}
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-3 py-4 sm:px-4 md:py-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold sm:text-2xl">Dashboard Admin</h1>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button 
            variant="default" 
            size="sm"
            className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700"
            onClick={() => setBroadcastNotifyOpen(true)}
          >
            📢 Notifier les vendeurs
          </Button>
          <Button 
            variant="destructive" 
            size="sm"
            className="w-full sm:w-auto"
            onClick={handleLogout}
          >
            Se déconnecter
          </Button>
        </div>
      </div>

      {!isOnline && (
        <div className="max-w-6xl mx-auto mb-4">
          <div className="bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 px-4 py-2 rounded">⚠️ Hors-ligne — affichage des données en cache</div>
        </div>
      )}

      <div>
        <div className="mb-4 space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button className={`shrink-0 rounded px-3 py-2 text-sm ${activeTab === 'orders' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`} onClick={() => setActiveTab('orders')}>Commandes</button>
            <button className={`shrink-0 rounded px-3 py-2 text-sm ${activeTab === 'transactions' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`} onClick={() => setActiveTab('transactions')}>Transactions</button>
            <button className={`shrink-0 rounded px-3 py-2 text-sm ${activeTab === 'payouts' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`} onClick={() => setActiveTab('payouts')}>Payouts</button>
            <button className={`shrink-0 rounded px-3 py-2 text-sm ${activeTab === 'payouts_history' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`} onClick={() => setActiveTab('payouts_history')}>Historique</button>
            <button className={`shrink-0 rounded px-3 py-2 text-sm ${activeTab === 'commissions' ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-900'}`} onClick={() => setActiveTab('commissions')}>📊 Commissions</button>
            <button className={`shrink-0 rounded px-3 py-2 text-sm ${activeTab === 'refunds' ? 'bg-pink-700 text-white' : 'bg-pink-100 text-pink-800'}`} onClick={() => setActiveTab('refunds')}>🔄 Remboursements</button>
            <button className={`shrink-0 rounded px-3 py-2 text-sm ${activeTab === 'transfers' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`} onClick={() => setActiveTab('transfers')}>💸 Transferts</button>
          </div>

          <div className="relative w-full">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`🔍 Rechercher ${
                activeTab === 'orders' ? 'commandes (code, nom, téléphone, statut...)' : 
                activeTab === 'transactions' ? 'transactions (ID, order, batch, provider...)' : 
                activeTab === 'commissions' ? 'commissions (order, vendeur, statut...)' :
                activeTab === 'transfers' ? 'transfers (téléphone, wallet, statut...)' : 
                activeTab === 'refunds' ? 'remboursements (order, acheteur, statut...)' : 
                'batches (ID, statut...)'
              }`}
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-10 text-sm focus:border-transparent focus:ring-2 focus:ring-green-500"
            />
            <svg className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {activeTab === 'orders' && (
          <Card>
            <CardHeader>
              <CardTitle>Commandes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full overflow-x-auto">
              <Table className="min-w-[1080px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">ID</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Acheteur</TableHead>
                    <TableHead>Vendeur</TableHead>
                    <TableHead>Livraison</TableHead>
                    <TableHead>Adresse</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Payout</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filterOrders(orders)
                    .filter(o => String(o.status).toLowerCase() === 'delivered')
                    .map((o: OrderFull) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-xs truncate max-w-[80px]" title={o.id}>{o.id.substring(0, 8)}...</TableCell>
                        <TableCell>{o.order_code}</TableCell>
                        <TableCell>{displayOrderPerson(o, 'buyer')}</TableCell>
                        <TableCell>{displayOrderPerson(o, 'vendor')}</TableCell>
                        <TableCell>{displayOrderPerson(o, 'delivery')}</TableCell>
                        <TableCell>{displayOrderAddress(o)}</TableCell>
                        <TableCell>{o.total_amount?.toLocaleString()} FCFA</TableCell>
                        <TableCell>{o.status}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-sm ${
                            o.payout_status === 'paid' ? 'bg-green-100 text-green-800' : 
                            o.payout_status === 'processing' ? 'bg-blue-100 text-blue-800' : 
                            o.payout_status === 'scheduled' ? 'bg-purple-100 text-purple-800' :
                            o.payout_status === 'requested' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {o.payout_status === 'paid' ? 'Payé ✓' : 
                             o.payout_status === 'processing' ? 'En cours' :
                             o.payout_status === 'scheduled' ? 'Programmé' :
                             o.payout_status === 'requested' ? 'Demandé' :
                             o.payout_status || '-'}
                          </span>
                          {o.payout_paid_at ? ` — Payé le ${new Date(o.payout_paid_at).toLocaleString()}` : 
                           o.payout_requested_at ? ` — Demandé le ${new Date(o.payout_requested_at).toLocaleString()}` : ''}
                        </TableCell>
                        <TableCell className="flex gap-2">
                          <Button 
                            size="sm" 
                            onClick={() => handlePayout(o.id)} 
                            disabled={!(o.status === 'delivered' && o.payout_status === 'requested') || processing}
                            className={
                              o.payout_status === 'paid' ? 'bg-primary text-primary-foreground cursor-default' : 
                              o.payout_status === 'scheduled' ? 'bg-purple-600 hover:bg-purple-600 cursor-default' :
                              o.payout_status === 'processing' ? 'bg-blue-600 hover:bg-blue-600 cursor-default' :
                              ''
                            }
                          >
                            {o.payout_status === 'paid' ? '✓ Payé' : 
                             o.payout_status === 'processing' ? '⏳ En cours' : 
                             o.payout_status === 'scheduled' ? '📅 Programmé' : 
                             'Payer'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}

                  {filterOrders(orders).filter(o => String(o.status).toLowerCase() === 'delivered').length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-gray-500">Aucune commande livrée</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>


            </CardContent>
          </Card>
        )}

        {activeTab === 'transactions' && (
          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Transactions (payouts)</CardTitle>
              <Button 
                variant="outline" 
                size="sm"
                disabled={processing}
                onClick={async () => {
                  if (!confirm('Synchroniser les transactions en attente ? Cela va marquer comme réussies les transactions PENDING1 qui ont plus de 30 minutes.')) return;
                  setProcessing(true);
                  try {
                    const res = await fetch(apiUrl('/api/admin/sync-pending-transactions'), { 
                      method: 'POST', 
                      headers: { ...getAuthHeader() },
                      credentials: 'include'
                    });
                    const json = await res.json();
                    if (!res.ok) throw new Error(json?.error || 'Erreur synchronisation');
                    toast({ 
                      title: 'Synchronisation terminée', 
                      description: `${json.synced || 0} transactions mises à jour sur ${json.total || 0}` 
                    });
                    fetchData();
                  } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err);
                    toast({ title: 'Erreur', description: message, variant: 'destructive' });
                  } finally {
                    setProcessing(false);
                  }
                }}
              >
                {processing ? '⏳ Sync...' : '🔄 Sync Pending'}
              </Button>
            </CardHeader>
            <CardContent>

              <div className="w-full overflow-x-auto">
              <Table className="min-w-[980px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">ID</TableHead>
                    <TableHead>Order / Batch</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Provider Tx</TableHead>
                    <TableHead>Créé</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filterTransactions(transactions).slice().sort((a,b) => {
                    const priority = (s?: string) => s === 'pending' ? 0 : s === 'queued' ? 1 : s === 'processing' ? 2 : s === 'failed' ? 3 : s === 'paid' ? 4 : 5;
                    const pa = priority(a.status);
                    const pb = priority(b.status);
                    if (pa !== pb) return pa - pb;
                    return (new Date(b.created_at || 0).getTime()) - (new Date(a.created_at || 0).getTime());
                  }).map((t: TransactionFull) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs truncate max-w-[80px]" title={t.transaction_id || t.id}>{(t.transaction_id || t.id).substring(0, 8)}...</TableCell>
                      <TableCell>{t.order?.order_code || t.order_id || (t.batch_id ? `batch:${t.batch_id}` : '-')}</TableCell>
                      <TableCell>{t.amount?.toLocaleString()} FCFA</TableCell>
                      <TableCell>{t.transaction_type}</TableCell>
                      <TableCell>{t.provider_transaction_id || getProviderId(t.raw_response) || '-'}</TableCell>
                      <TableCell>{t.created_at ? new Date(t.created_at).toLocaleString() : '-'}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded text-sm ${txStatusClass(t.status)}`}>
                          {TX_STATUS_LABELS_FR[t.status || 'pending'] || (t.status || '-')}
                        </span>
                      </TableCell>
                      <TableCell className="flex gap-2">
                        <Button size="sm" onClick={() => openTxDetails(t)}>Voir</Button>
                        {(String(t.status).toLowerCase() === 'pending' || String(t.status).toLowerCase() === 'failed') && !String(t.id).startsWith('order-') && (
                          <Button size="sm" variant="destructive" onClick={async () => { if (!confirm('Relancer cette transaction ?')) return; await retryTransaction(t.id); }} disabled={retryingTxId === t.id}>{retryingTxId === t.id ? 'Relance...' : 'Relancer'}</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}

                  {filterTransactions(transactions).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-gray-500">Aucune transaction enregistrée</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        )}



        {activeTab === 'payouts' && (
          <Card>
            <CardHeader>
              <CardTitle>Payout Batches</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={async () => {
                    setProcessing(true);
                    try {
                      const pctRaw = prompt('Pourcentage de commission à appliquer sur ce batch (ex: 2 pour 2%) ?', '0');
                      if (pctRaw === null) { setProcessing(false); return; }
                      const pct = Number(pctRaw);
                      if (isNaN(pct) || pct < 0) throw new Error('Commission invalide');

                      const res = await fetch(apiUrl('/api/admin/payout-batches/create'), { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, body: JSON.stringify({ commission_pct: pct }) });
                      const json = await res.json();
                      if (!res.ok) throw new Error(json?.error || 'Erreur création batch');
                      toast({ title: 'Succès', description: `Batch créé (commission ${pct}%)` });
                      fetchData();
                    } catch (err: unknown) {
                      const message = err instanceof Error ? err.message : String(err || 'Erreur');
                      toast({ title: 'Erreur', description: message, variant: 'destructive' });
                    } finally { setProcessing(false); }
                  }}>Créer Batch</Button>
                  <Button variant="secondary" onClick={async () => { setProcessing(true); try { const res = await fetch(apiUrl('/api/admin/payout-batches/process-scheduled'), { method: 'POST', headers: { ...getAuthHeader() } }); const json = await res.json(); if (!res.ok) throw new Error(json?.error || 'Erreur'); toast({ title: 'Succès', description: `Processed ${json.processed || 0} batches` }); fetchData(); } catch(err: unknown) { toast({ title: 'Erreur', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); } finally { setProcessing(false); } }}>Exécuter programmés</Button>

                </div>
              </div>

              <div className="w-full overflow-x-auto">
                <Table className="min-w-[860px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">ID</TableHead>
                      <TableHead>Scheduled</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filterBatches(batches).filter(b => !['completed','cancelled'].includes(b.status || '')).map(b => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono text-xs truncate max-w-[80px]" title={b.id}>{b.id.substring(0, 8)}...</TableCell>
                        <TableCell>{b.scheduled_at ? new Date(b.scheduled_at).toLocaleString() : '-'}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-sm ${
                            b.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                            b.status === 'scheduled' ? 'bg-purple-100 text-purple-800' :
                            b.status === 'completed' ? 'bg-green-100 text-green-800' :
                            b.status === 'failed' ? 'bg-red-100 text-red-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {b.status === 'processing' ? '⏳ En cours' :
                             b.status === 'scheduled' ? '📅 Programmé' :
                             b.status === 'completed' ? '✓ Terminé' :
                             b.status === 'failed' ? '✗ Échoué' :
                             b.status || '-'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {(b.total_amount||0).toLocaleString()} FCFA
                          {b.commission_pct ? ` — commission ${b.commission_pct}%` : ''}
                        </TableCell>
                        <TableCell className="flex gap-2">
                          <Button size="sm" onClick={async () => { setProcessing(true); try { const res = await fetch(apiUrl(`/api/admin/payout-batches/${b.id}/details`), { headers: { ...getAuthHeader() } }); const json = await res.json(); if (!res.ok) throw new Error(json?.error || 'Erreur'); setSelectedBatch(json.batch); setSelectedBatchItems(json.items||[]); setBatchDetailsOpen(true); } catch(err: unknown) { toast({ title: 'Erreur', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); } finally { setProcessing(false); } }}>Details</Button>
                          <Button size="sm" disabled={b.status === 'processing' || processing} className={b.status === 'processing' ? 'bg-blue-400' : ''} onClick={async () => { setProcessing(true); try { const res = await fetch(apiUrl(`/api/admin/payout-batches/${b.id}/process`), { method: 'POST', headers: { ...getAuthHeader() } }); const json = await res.json(); if (!res.ok) throw new Error(json?.error || 'Erreur'); toast({ title: 'Succès', description: b.status === 'failed' ? 'Relance du batch initiée' : 'Batch processed' }); fetchData(); } catch(err: unknown) { toast({ title: 'Erreur', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); } finally { setProcessing(false); } }}>{b.status === 'processing' ? '⏳ En cours...' : b.status === 'failed' ? 'Relancer' : 'Traiter'}</Button>
                          <Button size="sm" variant="destructive" disabled={b.status === 'processing' || processing} onClick={async () => { setProcessing(true); try { const res = await fetch(apiUrl(`/api/admin/payout-batches/${b.id}/cancel`), { method: 'POST', headers: { ...getAuthHeader() } }); const json = await res.json(); if (!res.ok) throw new Error(json?.error || 'Erreur'); toast({ title: 'Succès', description: 'Batch cancelled' }); fetchData(); } catch(err: unknown) { toast({ title: 'Erreur', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); } finally { setProcessing(false); } }}>Annuler</Button>
                        </TableCell>
                      </TableRow>
                    ))}

                    {filterBatches(batches).filter(b => !['completed','failed','cancelled'].includes(b.status || '')).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-gray-500">Aucun payout en attente</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'payouts_history' && (
          <Card>
            <CardHeader>
              <CardTitle>Historique Payouts</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-3">Liste des batches complétés / annulés (historique)</p>
              <div className="w-full overflow-x-auto">
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">ID</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filterBatches(batches).filter(b => ['completed','cancelled'].includes(b.status || '')).map(b => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs truncate max-w-[80px]" title={b.id}>{b.id.substring(0, 8)}...</TableCell>
                      <TableCell>{b.scheduled_at ? new Date(b.scheduled_at).toLocaleString() : '-'}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded text-sm ${
                          b.status === 'completed' ? 'bg-green-100 text-green-800' :
                          b.status === 'failed' ? 'bg-red-100 text-red-800' :
                          b.status === 'cancelled' ? 'bg-slate-200 text-slate-600' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {b.status === 'completed' ? '✓ Terminé' :
                           b.status === 'failed' ? '✗ Échoué' :
                           b.status === 'cancelled' ? '⊘ Annulé' :
                           b.status || '-'}
                        </span>
                      </TableCell>
                      <TableCell>{(b.total_amount||0).toLocaleString()} FCFA</TableCell>
                      <TableCell className="flex gap-2">
                        <Button size="sm" onClick={async () => { setProcessing(true); try { const res = await fetch(apiUrl(`/api/admin/payout-batches/${b.id}/details`), { headers: { ...getAuthHeader() } }); const json = await res.json(); if (!res.ok) throw new Error(json?.error || 'Erreur'); setSelectedBatch(json.batch); setSelectedBatchItems(json.items||[]); setBatchDetailsOpen(true); } catch(err: unknown) { toast({ title: 'Erreur', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); } finally { setProcessing(false); } }}>Details</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'commissions' && (
          <Card>
            <CardHeader>
              <CardTitle>📊 Commissions Payouts</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-gray-600">
                Affichage limité aux commissions réellement appliquées sur les payouts.
              </p>

              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-emerald-700">Total commissions appliquées</p>
                  <p className="mt-1 text-xl font-semibold text-emerald-900">{formatFcfa(commissionOverview.totalCommission)}</p>
                  <p className="text-xs text-emerald-800">Commission moyenne: {formatFcfa(commissionOverview.averageCommission)}</p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-blue-700">Commissions payées</p>
                  <p className="mt-1 text-xl font-semibold text-blue-900">{formatFcfa(commissionOverview.commissionPaid)}</p>
                  <p className="text-xs text-blue-800">Déjà encaissées</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-amber-700">Commissions en cours</p>
                  <p className="mt-1 text-xl font-semibold text-blue-900">{formatFcfa(commissionOverview.commissionPending)}</p>
                  <p className="text-xs text-amber-800">Payouts non finalisés</p>
                </div>
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-rose-700">Payouts commissionnés</p>
                  <p className="mt-1 text-xl font-semibold text-rose-900">{commissionOverview.payoutsWithCommission}</p>
                  <p className="text-xs text-rose-800">Taux moyen: {commissionOverview.averageRate.toFixed(2)}%</p>
                </div>
              </div>

              <p className="mb-5 text-xs text-slate-500">
                Commissions échouées: {formatFcfa(commissionOverview.commissionFailed)}
              </p>

              <div className="w-full overflow-x-auto">
                <Table className="min-w-[1080px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch</TableHead>
                      <TableHead>Commande</TableHead>
                      <TableHead>Vendeur</TableHead>
                      <TableHead>Montant payout</TableHead>
                      <TableHead>Taux</TableHead>
                      <TableHead>Commission</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filterCommissionRows(commissionOverview.rows).map(row => (
                      <TableRow key={row.payoutItemId}>
                        <TableCell className="font-mono text-xs truncate max-w-[90px]" title={row.batchId}>
                          {row.batchId !== '-' ? `${row.batchId.slice(0, 8)}...` : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{row.orderCode}</div>
                          <div className="text-xs text-gray-500">{row.orderId !== '-' ? `${row.orderId.slice(0, 8)}...` : '-'}</div>
                        </TableCell>
                        <TableCell>{row.vendorName}</TableCell>
                        <TableCell>{formatFcfa(row.grossAmount)}</TableCell>
                        <TableCell>{row.commissionRate > 0 ? `${row.commissionRate.toFixed(2)}%` : '-'}</TableCell>
                        <TableCell className="font-semibold text-emerald-700">{formatFcfa(row.commissionAmount)}</TableCell>
                        <TableCell>
                          <span className={`rounded px-2 py-1 text-xs ${
                            row.status === 'paid' ? 'bg-green-100 text-green-800' :
                            row.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                            row.status === 'failed' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {row.status === 'paid' ? 'Payée' :
                             row.status === 'processing' ? 'En cours' :
                             row.status === 'failed' ? 'Échouée' :
                             'En file'}
                          </span>
                        </TableCell>
                        <TableCell>{row.createdAt ? new Date(row.createdAt).toLocaleString() : '-'}</TableCell>
                      </TableRow>
                    ))}

                    {filterCommissionRows(commissionOverview.rows).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-gray-500">
                          Aucune commission calculable pour le moment
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'transfers' && (
          <Card>
            <CardHeader>
              <CardTitle>💸 Transferts / Retraits</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Transférer de l'argent de votre compte Pixpay vers un compte Wave ou Orange Money de votre choix.
              </p>

              {/* Transfer Form */}
              <div className="bg-slate-50 p-4 rounded-lg mb-6">
                <h4 className="font-semibold mb-3">Nouveau transfert</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Montant (FCFA) *</label>
                    <input
                      type="number"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      placeholder="Ex: 50000"
                      className="w-full px-3 py-2 border rounded"
                      min="100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Numéro de téléphone *</label>
                    <input
                      type="tel"
                      inputMode="tel"
                      pattern="[0-9+\s-]*"
                      value={transferPhone}
                      onChange={(e) => setTransferPhone(e.target.value)}
                      placeholder="Ex: 774254729"
                      className="w-full px-3 py-2 border rounded text-xl h-14 md:text-base md:h-10"
                      style={{ fontSize: '20px' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="transfer-wallet-type">Type de wallet *</label>
                    <select
                      id="transfer-wallet-type"
                      title="Type de wallet"
                      value={transferWalletType}
                      onChange={(e) => setTransferWalletType(e.target.value as 'wave-senegal' | 'orange-senegal')}
                      className="w-full px-3 py-2 border rounded"
                    >
                      <option value="wave-senegal">🌊 Wave Sénégal</option>
                      <option value="orange-senegal">🟠 Orange Money Sénégal</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Note (optionnel)</label>
                    <input
                      type="text"
                      value={transferNote}
                      onChange={(e) => setTransferNote(e.target.value)}
                      placeholder="Ex: Retrait mensuel"
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <Button
                    onClick={async () => {
                      if (!transferAmount || parseInt(transferAmount) <= 0) {
                        toast({ title: 'Erreur', description: 'Montant invalide', variant: 'destructive' });
                        return;
                      }
                      if (!transferPhone) {
                        toast({ title: 'Erreur', description: 'Numéro de téléphone requis', variant: 'destructive' });
                        return;
                      }
                      if (!confirm(`Confirmer le transfert de ${parseInt(transferAmount).toLocaleString()} FCFA vers ${transferPhone} (${transferWalletType === 'wave-senegal' ? 'Wave' : 'Orange Money'}) ?`)) {
                        return;
                      }
                      
                      setTransferProcessing(true);
                      try {
                        const res = await fetch(apiUrl('/api/admin/transfers'), {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                          credentials: 'include',
                          body: JSON.stringify({
                            amount: parseInt(transferAmount),
                            phone: transferPhone,
                            walletType: transferWalletType,
                            note: transferNote || undefined
                          })
                        });
                        const json = await res.json();
                        if (!res.ok) {
                          throw new Error(json?.error || 'Erreur lors du transfert');
                        }
                        toast({ 
                          title: json.success ? 'Transfert initié' : 'Attention', 
                          description: json.success 
                            ? `Transfert de ${parseInt(transferAmount).toLocaleString()} FCFA en cours de traitement` 
                            : (json.transfer?.message || 'Le transfert a été soumis'),
                          variant: json.success ? 'default' : 'destructive'
                        });
                        // Reset form
                        setTransferAmount('');
                        setTransferPhone('');
                        setTransferNote('');
                        // Refresh data
                        fetchData();
                      } catch (err: unknown) {
                        const message = err instanceof Error ? err.message : String(err);
                        toast({ title: 'Erreur', description: message, variant: 'destructive' });
                      } finally {
                        setTransferProcessing(false);
                      }
                    }}
                    disabled={transferProcessing || !transferAmount || !transferPhone}
                    className="bg-primary text-primary-foreground"
                  >
                    {transferProcessing ? 'Transfert en cours...' : '💸 Effectuer le transfert'}
                  </Button>
                </div>
              </div>

              {/* Transfer History */}
              <h4 className="font-semibold mb-3">Historique des transferts</h4>
              <div className="w-full overflow-x-auto">
              <Table className="min-w-[820px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">ID</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead>Wallet</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filterTransfers(transfers).map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs truncate max-w-[80px]" title={t.id}>{t.id.substring(0, 8)}...</TableCell>
                      <TableCell className="font-semibold">{(t.amount || 0).toLocaleString()} FCFA</TableCell>
                      <TableCell>{t.phone || '-'}</TableCell>
                      <TableCell>
                        {t.wallet_type === 'wave-senegal' ? '🌊 Wave' : t.wallet_type === 'orange-senegal' ? '🟠 Orange' : t.wallet_type || '-'}
                      </TableCell>
                      <TableCell>{t.note || '-'}</TableCell>
                      <TableCell>
                        {/* Normalize the status for consistent label + color, treat PENDING1 as success per Pixpay behaviour */}
                        {(() => {
                          const normalized = normalizeStatus(t.status);
                          const label = (TX_STATUS_LABELS_FR[t.status || ''] || TX_STATUS_LABELS_FR[normalized] || t.status || '-');
                          const cls = normalized === 'paid' ? 'bg-green-100 text-green-800' :
                                    normalized === 'processing' ? 'bg-blue-100 text-blue-800' :
                                    normalized === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                    normalized === 'failed' ? 'bg-red-100 text-red-800' :
                                    'bg-slate-100 text-slate-700';
                          return (
                            <span className={`px-2 py-1 rounded text-sm ${cls}`}>
                              {label}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell>{t.created_at ? new Date(t.created_at).toLocaleString() : '-'}</TableCell>
                    </TableRow>
                  ))}
                  {filterTransfers(transfers).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-gray-500">Aucun transfert effectué</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'refunds' && (
          <Card>
            <CardHeader>
              <CardTitle>🔄 Demandes de remboursement</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Gérer les demandes de remboursement des clients
              </p>

              {/* Pending Refunds */}
              <h4 className="font-semibold mb-3">Demandes en attente</h4>
              <div className="w-full overflow-x-auto">
              <Table className="min-w-[1100px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">ID</TableHead>
                    <TableHead>Commande</TableHead>
                    <TableHead>Produit</TableHead>
                    <TableHead>Acheteur</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Raison</TableHead>
                    <TableHead>Date demande</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filterRefunds(refunds)
                    .filter(isRefundPending)
                    .map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs truncate max-w-[80px]" title={r.id}>{r.id.substring(0, 8)}...</TableCell>
                        <TableCell>{r.order?.order_code || r.order_id}</TableCell>
                        <TableCell>{r.order?.products?.name || r.order?.order_code || '-'}</TableCell>
                        <TableCell>{r.buyer?.full_name || '-'}<br /><span className="text-xs text-gray-500">{r.buyer?.phone}</span></TableCell>
                        <TableCell className="font-semibold">{(r.amount || 0).toLocaleString()} FCFA</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${r.order?.payment_method === 'wave' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                            {r.order?.payment_method === 'wave' ? '🌊 Wave' : '🟠 Orange Money'}
                          </span>
                        </TableCell>
                        <TableCell>{r.reason || '-'}</TableCell>
                        <TableCell>{r.requested_at ? new Date(r.requested_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="default"
                              className="bg-primary text-primary-foreground"
                              onClick={() => {
                                if (confirm(`Approuver le remboursement de ${(r.amount || 0).toLocaleString()} FCFA pour ${r.buyer?.full_name} via ${r.order?.payment_method === 'wave' ? 'Wave' : 'Orange Money'}?`)) {
                                  handleApproveRefund(r.id);
                                }
                              }}
                              disabled={processing}
                            >
                              ✓ Approuver
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => {
                                const reason = prompt('Raison du rejet:');
                                if (reason) {
                                  handleRejectRefund(r.id, reason);
                                }
                              }}
                              disabled={processing}
                            >
                              ✗ Rejeter
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  {filterRefunds(refunds).filter(isRefundPending).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-gray-500">Aucune demande en attente</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>

              {/* Processed Refunds History */}
              <h4 className="font-semibold mt-8 mb-3">Historique des remboursements</h4>
              <div className="w-full overflow-x-auto">
              <Table className="min-w-[1100px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">ID</TableHead>
                    <TableHead>Commande</TableHead>
                    <TableHead>Acheteur</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Raison</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date traitement</TableHead>
                    <TableHead>Traité par</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filterRefunds(refunds)
                    .filter(r => !isRefundPending(r))
                    .sort((a, b) => {
                      const dateA = a.reviewed_at || a.processed_at || a.requested_at || '';
                      const dateB = b.reviewed_at || b.processed_at || b.requested_at || '';
                      return new Date(dateB).getTime() - new Date(dateA).getTime();
                    })
                    .map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs truncate max-w-[80px]" title={r.id}>{r.id.substring(0, 8)}...</TableCell>
                        <TableCell>{r.order?.order_code || r.order_id}</TableCell>
                        <TableCell>{r.buyer?.full_name || '-'}</TableCell>
                        <TableCell className="font-semibold">{(r.amount || 0).toLocaleString()} FCFA</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${r.order?.payment_method === 'wave' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                            {r.order?.payment_method === 'wave' ? '🌊 Wave' : '🟠 Orange Money'}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{r.reason || '-'}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-sm ${
                            r.status === 'approved' || r.status === 'processed' 
                              ? 'bg-green-100 text-green-800' 
                              : r.status === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {r.status === 'approved' ? 'Approuvé ✓' : r.status === 'processed' ? 'Traité ✓' : r.status === 'rejected' ? 'Rejeté ✗' : r.status}
                          </span>
                          {r.status === 'rejected' && r.rejection_reason && (
                            <div className="text-xs text-gray-500 mt-1">Motif: {r.rejection_reason}</div>
                          )}
                        </TableCell>
                        <TableCell>{r.reviewed_at ? new Date(r.reviewed_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : r.processed_at ? new Date(r.processed_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</TableCell>
                        <TableCell className="text-xs text-gray-500">{r.reviewed_by || '-'}</TableCell>
                      </TableRow>
                    ))}
                  {filterRefunds(refunds).filter(r => !isRefundPending(r)).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-gray-500">Aucun historique de remboursement</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    {batchDetailsOpen && <BatchDetailsModal batch={selectedBatch} items={selectedBatchItems} onClose={() => setBatchDetailsOpen(false)} onOpenInvoice={async (vendorId, format = 'html') => {
      const batchId = selectedBatch?.id || '';
      const baseUrl = `/api/admin/payout-batches/${batchId}/invoice?vendorId=${encodeURIComponent(vendorId)}&format=${encodeURIComponent(format)}`;
      if (format === 'html') {
        await openInvoiceInModal(baseUrl, `Facture Batch ${selectedBatch?.id?.slice(0, 8)} - Vendeur`);
        return;
      }

      const fallbackName = `facture-batch-${String(batchId).slice(0, 8)}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      await downloadInvoiceFile(baseUrl, fallbackName);
    }} onOpenVendorsNetFile={async (format = 'html') => {
      const batchId = selectedBatch?.id || '';
      const baseUrl = `/api/admin/payout-batches/${batchId}/vendors-net?format=${encodeURIComponent(format)}`;
      if (format === 'html') {
        await openInvoiceInModal(baseUrl, `Liste vendeurs - net a envoyer (${String(batchId).slice(0, 8)})`);
        return;
      }

      const fallbackName = `vendeurs-net-batch-${String(batchId).slice(0, 8)}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      await downloadInvoiceFile(baseUrl, fallbackName);
    }} onRetryItem={async (it) => {
      setProcessing(true);
      try {
        if (!confirm('Confirmer la relance du payout pour cette commande ?')) return;
        const res = await fetch(apiUrl('/api/admin/verify-and-payout'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, body: JSON.stringify({ orderId: it.order_id, execute: true }) });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Erreur relance payout');
        toast({ title: 'Succès', description: 'Relance initiée (processing).' });
        fetchData();
      } catch (err: unknown) {
        toast({ title: 'Erreur', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
      } finally {
        setProcessing(false);
      }
    }} />}
    {/* Broadcast Notification Dialog */}
    {broadcastNotifyOpen && (
      <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center backdrop-blur-sm p-3">
        <div className="w-full max-w-md rounded-lg bg-white shadow-2xl">
          <div className="border-b p-4">
            <h3 className="text-lg font-semibold">📢 Envoyer une notification à tous les vendeurs</h3>
          </div>
          <div className="space-y-4 p-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Titre</label>
              <input
                type="text"
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                placeholder="Ex: Mise à jour importante"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea
                value={broadcastBody}
                onChange={(e) => setBroadcastBody(e.target.value)}
                placeholder="Entrez votre message ici..."
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-200 resize-none"
                rows={4}
              />
            </div>
          </div>
          <div className="flex gap-2 border-t p-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBroadcastNotifyOpen(false);
                setBroadcastTitle('');
                setBroadcastBody('');
              }}
              disabled={broadcastSending}
            >
              Annuler
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-orange-600 hover:bg-orange-700"
              onClick={sendBroadcastNotification}
              disabled={broadcastSending}
            >
              {broadcastSending ? 'Envoi...' : 'Envoyer'}
            </Button>
          </div>
        </div>
      </div>
    )}
    
    {/* Modal Invoice Viewer */}
    {invoiceViewerOpen && (
      <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center backdrop-blur-sm">
        <div className="mx-3 flex max-h-[92vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-2xl sm:mx-4">
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold">{invoiceViewerTitle}</h3>
            <div className="flex flex-wrap gap-2">
              {invoiceViewerHtml && (
                <Button size="sm" onClick={downloadVisibleInvoice} className="bg-primary text-primary-foreground">
                  Télécharger
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setInvoiceViewerOpen(false)}>
                Fermer
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {invoiceViewerLoading && (
              <div className="flex items-center justify-center py-8">
                <Spinner size="sm" />
              </div>
            )}
            {!invoiceViewerLoading && invoiceViewerHtml && (
              <div dangerouslySetInnerHTML={{ __html: invoiceViewerHtml }} />
            )}
            {!invoiceViewerLoading && !invoiceViewerHtml && (
              <p className="text-center text-gray-500">Aucun contenu</p>
            )}
          </div>
        </div>
      </div>
    )}
    </div>
  );
};

// Batch details modal
{ /* Render a printable details modal when open */ }
function BatchDetailsModal({ batch, items, onClose, onOpenInvoice, onOpenVendorsNetFile, onRetryItem }:{ batch: PayoutBatch | null; items: PayoutBatchItem[]; onClose: () => void; onOpenInvoice: (vendorId: string, format?: 'html' | 'pdf' | 'xlsx') => void | Promise<void>; onOpenVendorsNetFile?: (format?: 'html' | 'pdf' | 'xlsx') => void | Promise<void>; onRetryItem?: (item: PayoutBatchItem) => void }){
  if (!batch) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl bg-white shadow-lg">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Détails Batch {batch.id}</h3>
          <div className="flex flex-wrap items-center gap-2">
            {onOpenVendorsNetFile && (
              <>
                <Button size="sm" variant="outline" onClick={() => onOpenVendorsNetFile('html')}>Vendeurs (voir)</Button>
                <Button size="sm" onClick={() => onOpenVendorsNetFile('pdf')}>Vendeurs PDF</Button>
                <Button size="sm" variant="secondary" onClick={() => onOpenVendorsNetFile('xlsx')}>Vendeurs Excel</Button>
              </>
            )}
            <Button variant="ghost" onClick={onClose}>Fermer</Button>
          </div>
        </div>
        <div className="p-4">
          <p><strong>Scheduled:</strong> {batch.scheduled_at ? new Date(batch.scheduled_at).toLocaleString() : '-'}</p>
          <p><strong>Status:</strong> {batch.status}</p>
          <p><strong>Commission:</strong> {batch.commission_pct || 0}%</p>

          <div className="mt-4">
            <h4 className="font-semibold mb-2">Items</h4>
            <div className="w-full overflow-x-auto">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Vendeur</TableHead>
                  <TableHead>Brut</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(it => (
                  <TableRow key={it.id}>
                    <TableCell>{it.order?.order_code || it.order_id}</TableCell>
                    <TableCell>{displayProfileName(it.vendor)}</TableCell>
                    <TableCell>{(it.amount||0).toLocaleString()} FCFA</TableCell>
                    <TableCell>{(it.commission_amount||0).toLocaleString()} FCFA</TableCell>
                    <TableCell>{(it.net_amount||0).toLocaleString()} FCFA</TableCell>
                    <TableCell>{it.status}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => onOpenInvoice(it.vendor_id || '', 'html')}>Voir</Button>
                        <Button size="sm" onClick={() => onOpenInvoice(it.vendor_id || '', 'pdf')}>PDF</Button>
                        <Button size="sm" variant="secondary" onClick={() => onOpenInvoice(it.vendor_id || '', 'xlsx')}>Excel</Button>
                        {onRetryItem && it.status !== 'paid' && (
                          <Button size="sm" variant="secondary" onClick={() => onRetryItem(it)}>Relancer</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Transaction details modal (show provider/raw responses)
function TransactionDetailsModal({ tx, onClose }: { tx: TransactionFull | null; onClose: () => void }){
  if (!tx) return null;
  const pretty = (obj?: Record<string, unknown> | null) => {
    try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl bg-white shadow-lg">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Transaction {tx.transaction_id || tx.id}</h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>Fermer</Button>
          </div>
        </div>
        <div className="p-4">
          <p><strong>Order/Batch:</strong> {tx.order?.order_code || tx.order_id || (tx.batch_id ? `batch:${tx.batch_id}` : '-')}</p>
          <p><strong>Type:</strong> {tx.transaction_type}</p>
          <p><strong>Montant:</strong> {tx.amount?.toLocaleString()} FCFA</p>
          <p><strong>Statut:</strong> {tx.status}</p>
          <p className="mt-3"><strong>Provider transaction id:</strong> {tx.provider_transaction_id || '-'}</p>
          <div className="mt-2">
            <h4 className="font-semibold">Provider response</h4>
            <pre className="bg-slate-50 p-3 rounded text-sm overflow-auto">{pretty(tx.provider_response)}</pre>
          </div>
          <div className="mt-2">
            <h4 className="font-semibold">Raw response</h4>
            <pre className="bg-slate-50 p-3 rounded text-sm overflow-auto">{pretty(tx.raw_response)}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main export
export default AdminDashboard;
