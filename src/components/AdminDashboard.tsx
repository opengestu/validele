 
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { apiUrl } from '@/lib/api';
import useNetwork from '@/hooks/useNetwork';

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
  order?: { id: string; order_code?: string; products?: { name?: string } } | null;
  buyer?: ProfileRef | null;
};

const AdminDashboard: React.FC = () => {
  const { toast } = useToast();
  const { session, userProfile, loading: authLoading } = useAuth();
  const params = useParams();
  const adminId = params?.adminId;
  const [orders, setOrders] = useState<OrderFull[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [batches, setBatches] = useState<PayoutBatch[]>([]);
  const [batchItems, setBatchItems] = useState<PayoutBatchItem[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<PayoutBatch | null>(null);
  const [selectedBatchItems, setSelectedBatchItems] = useState<PayoutBatchItem[]>([]);
  const [batchDetailsOpen, setBatchDetailsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'orders'|'transactions'|'payouts'|'payouts_history'|'transfers'|'refunds'>('orders');

  // Admin transfers state
  const [transfers, setTransfers] = useState<AdminTransfer[]>([]);
  
  // Refunds state
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferPhone, setTransferPhone] = useState('');
  const [transferWalletType, setTransferWalletType] = useState<'wave-senegal' | 'orange-senegal'>('wave-senegal');
  const [transferNote, setTransferNote] = useState('');
  const [transferProcessing, setTransferProcessing] = useState(false);

  // Admin login state - DOIT ÊTRE DÉCLARÉ AVANT LES useEffect
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminOtp, setAdminOtp] = useState('');
  const [adminProcessing, setAdminProcessing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

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

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  const ADMIN_ID = import.meta.env.VITE_ADMIN_USER_ID || '';
  // If we have a userProfile, ensure it matches the admin id or the adminId param.
  // If there is no userProfile (not signed-in via supabase), allow the page to attempt admin login via cookies.
  const isAdminUser = userProfile ? !!(userProfile.id === ADMIN_ID || (adminId && userProfile.id === adminId)) : true;


  // Vérifier la session admin au chargement
  useEffect(() => {
    const checkAdminSession = async () => {
      try {
        const res = await fetch(apiUrl('/api/admin/validate'), {
          headers: getAuthHeader(),
          credentials: 'include'
        });
        if (res.ok) {
          setIsAuthenticated(true);
          setShowAdminLogin(false);
        } else {
          setIsAuthenticated(false);
          setShowAdminLogin(true);
        }
      } catch (error) {
        console.error('Erreur vérification session:', error);
        setIsAuthenticated(false);
        setShowAdminLogin(true);
      }
    };

    checkAdminSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // If the user is known and not admin, block access. If userProfile is missing, allow showing login form.
    if (userProfile && !isAdminUser) {
      setLoading(false);
      return;
    }
    if (isAuthenticated) {
      fetchData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile, adminId, isAuthenticated]);

  const getAuthHeader = (): HeadersInit => {
    const adminToken = localStorage.getItem('admin_token');
    if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
    if (adminToken) return { Authorization: `Bearer ${adminToken}` };
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
    PENDING1: 'En attente',
    PENDING2: 'En attente',
    SUCCESSFUL: 'Réussie ✓',
    SUCCESS: 'Réussie ✓',
    FAILED: 'Échouée'
  };
  
  // Normalize status for consistent display
  const normalizeStatus = (s?: string): string => {
    const st = String(s || '').toUpperCase();
    if (st === 'SUCCESSFUL' || st === 'SUCCESS') return 'paid';
    if (st === 'PENDING1' || st === 'PENDING2') return 'pending';
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
    try {
      await fetch(apiUrl('/api/admin/logout'), {
        method: 'POST',
        headers: getAuthHeader(),
        credentials: 'include'
      });
      
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
        description: 'Vous avez été déconnecté avec succès' 
      });
    } catch (error) {
      console.error('Erreur déconnexion:', error);
      toast({ 
        title: 'Erreur', 
        description: 'Erreur lors de la déconnexion', 
        variant: 'destructive' 
      });
    }
  };

  // Ouvrir une facture dans une modal avec authentification admin
  const openInvoiceInModal = async (url: string, title = 'Facture') => {
    try {
      setInvoiceViewerLoading(true);
      setInvoiceViewerTitle(title);
      setInvoiceViewerHtml(null);
      setInvoiceViewerFilename(null);

      const fullUrl = url.startsWith('http') ? url : apiUrl(url);
      const authHeaders = getAuthHeader();
      const headers: Record<string,string> = { 
        'Accept': 'text/html, */*'
      };
      // Copier les headers d'auth s'ils existent
      if (authHeaders && typeof authHeaders === 'object') {
        Object.assign(headers, authHeaders);
      }

      const resp = await fetch(fullUrl, { 
        method: 'GET', 
        headers,
        credentials: 'include' // Important pour envoyer les cookies admin
      });

      if (!resp.ok) {
        if (resp.status === 403 || resp.status === 401) {
          toast({ 
            title: 'Non autorisé', 
            description: 'Session admin expirée. Veuillez vous reconnecter.', 
            variant: 'destructive' 
          });
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
      
      toast({ 
        title: '✅ Remboursement approuvé', 
        description: 'Le remboursement a été traité avec succès. Mise à jour des données...' 
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

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeader();
      const oRes = await fetch(apiUrl('/api/admin/orders'), { headers, credentials: 'include' });
      if (oRes.status === 401) {
        setIsAuthenticated(false);
        setShowAdminLogin(true);
        setLoading(false);
        return;
      }
      const tRes = await fetch(apiUrl('/api/admin/transactions'), { headers, credentials: 'include' });
      if (tRes.status === 401) {
        setIsAuthenticated(false);
        setShowAdminLogin(true);
        setLoading(false);
        return;
      }

      const batchesRes = await fetch(apiUrl('/api/admin/payout-batches'), { headers, credentials: 'include' });
      const refundsRes = await fetch(apiUrl('/api/admin/refund-requests'), { headers, credentials: 'include' });

      const oJson = await oRes.json();
      const tJson = await tRes.json();
      const batchesJson = await batchesRes.json();
      const refundsJson = refundsRes.ok ? await refundsRes.json() : { refunds: [] };

      if (oRes.ok) {
        const fetchedOrders = oJson.orders || [];
        setOrders(fetchedOrders);
        try { localStorage.setItem('admin_orders', JSON.stringify(fetchedOrders)); } catch(e) { /* ignore cache errors */ }
      }
      if (tRes.ok && oRes.ok) {
        // Merge server transactions with orders as synthetic transaction rows for orders missing transactions
        const serverTxs = tJson.transactions || [];
        const ordersList = oJson.orders || [];
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
        setTransactions(merged);
        try { localStorage.setItem('admin_transactions', JSON.stringify(merged)); } catch(e) { /* ignore cache errors */ }
      } else if (tRes.ok) {
        setTransactions(tJson.transactions || []);
        try { localStorage.setItem('admin_transactions', JSON.stringify(tJson.transactions || [])); } catch(e) { /* ignore cache errors */ }
      }

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

  // Show fullscreen spinner while auth is loading to prevent flash of auth page
  if (authLoading) {
    return (
      <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-white">
        <Spinner size="xl" className="text-[#24BD5C]" />
        <p className="text-lg font-medium text-gray-700 mt-4">Chargement...</p>
      </div>
    );
  }

  if (!isAdminUser) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <h1 className="text-xl font-bold mb-2">Accès restreint</h1>
        <p className="text-gray-600">Cette page est réservée à l'administrateur.</p>
      </div>
    );
  }

  if (showAdminLogin) {
    return (
      <div className="max-w-md mx-auto py-12 text-center">
        <h1 className="text-xl font-bold mb-4">Authentification administrateur requise</h1>
        <p className="text-gray-600 mb-4">Connectez-vous avec votre compte administrateur</p>

        <div>
          <input
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            placeholder="Email"
            className="mb-3 px-3 py-2 border rounded w-full"
            autoComplete="username"
          />
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="Mot de passe"
            className="mb-3 px-3 py-2 border rounded w-full"
            autoComplete="current-password"
          />
          <input
            type="text"
            value={adminOtp}
            onChange={(e) => setAdminOtp(e.target.value)}
            placeholder="Code 2FA (optionnel)"
            className="mb-3 px-3 py-2 border rounded w-full"
          />
          {authError && <div className="text-sm text-red-600 mb-3">{authError}</div>}
          <div className="flex gap-2 justify-center">
            <Button disabled={adminProcessing} onClick={async () => {
              setAdminProcessing(true);
              setAuthError(null);
              try {
                const res = await fetch(apiUrl('/api/admin/login'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ email: adminEmail, password: adminPassword, otp: adminOtp || undefined })
                });
                const json = await res.json();
                if (!res.ok) {
                  const msg = json?.error || json?.message || 'Identifiants invalides';
                  setAuthError(msg);
                  toast({ title: 'Erreur', description: msg, variant: 'destructive' });
                  return;
                }
                // Prefer httpOnly cookie set by server; remove legacy admin_token
                try { localStorage.removeItem('admin_token'); } catch(e) { /* ignore */ }
                setIsAuthenticated(true);
                setShowAdminLogin(false);
                setAdminEmail(''); setAdminPassword(''); setAdminOtp('');
                setAuthError(null);
                toast({ title: 'Authentifié', description: "Vous êtes connecté en tant qu'admin" });
                fetchData();
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err || 'Erreur connexion');
                setAuthError(message);
                toast({ title: 'Erreur', description: message, variant: 'destructive' });
              } finally {
                setAdminProcessing(false);
              }
            }}>Se connecter</Button>

            <Button variant="secondary" disabled title="Le login par PIN est désactivé pour les administrateurs">PIN désactivé</Button>
          </div>
        </div>

      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Dashboard Admin</h1>
        <Button 
          variant="destructive" 
          size="sm"
          onClick={handleLogout}
        >
          Se déconnecter
        </Button>
      </div>

      {!isOnline && (
        <div className="max-w-6xl mx-auto mb-4">
          <div className="bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 px-4 py-2 rounded">⚠️ Hors-ligne — affichage des données en cache</div>
        </div>
      )}

      <div>
        <div className="flex gap-4 mb-4 flex-wrap">
          <button className={`px-3 py-2 rounded ${activeTab === 'orders' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`} onClick={() => setActiveTab('orders')}>Commandes</button>
          <button className={`px-3 py-2 rounded ${activeTab === 'transactions' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`} onClick={() => setActiveTab('transactions')}>Transactions</button>
          <button className={`px-3 py-2 rounded ${activeTab === 'payouts' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`} onClick={() => setActiveTab('payouts')}>Payouts</button>
          <button className={`px-3 py-2 rounded ${activeTab === 'payouts_history' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`} onClick={() => setActiveTab('payouts_history')}>Historique</button>
          <button className={`px-3 py-2 rounded ${activeTab === 'refunds' ? 'bg-pink-700 text-white' : 'bg-pink-100 text-pink-800'}`} onClick={() => setActiveTab('refunds')}>🔄 Remboursements</button>
          <button className={`px-3 py-2 rounded ${activeTab === 'transfers' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`} onClick={() => setActiveTab('transfers')}>💸 Transferts</button>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`🔍 Rechercher ${
                activeTab === 'orders' ? 'commandes (code, nom, téléphone, statut...)' : 
                activeTab === 'transactions' ? 'transactions (ID, order, batch, provider...)' : 
                activeTab === 'transfers' ? 'transfers (téléphone, wallet, statut...)' : 
                activeTab === 'refunds' ? 'remboursements (order, acheteur, statut...)' : 
                'batches (ID, statut...)'
              }`}
              className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
              <Table>
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
                        <TableCell>{o.buyer?.full_name || '-'}</TableCell>
                        <TableCell>{o.vendor?.full_name || '-'}</TableCell>
                        <TableCell>{o.delivery?.full_name || '-'}</TableCell>
                        <TableCell>{o.buyer?.address || '-'}</TableCell>
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


            </CardContent>
          </Card>
        )}

        {activeTab === 'transactions' && (
          <Card>
            <CardHeader className="flex items-center justify-between">
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

              <Table>
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
            </CardContent>
          </Card>
        )}



        {activeTab === 'payouts' && (
          <Card>
            <CardHeader>
              <CardTitle>Payout Batches</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div />
                <div className="flex gap-2">
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

              <Table>
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
                  {filterBatches(batches).filter(b => !['completed','failed','cancelled'].includes(b.status || '')).map(b => (
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
                        <Button size="sm" disabled={b.status === 'processing' || processing} className={b.status === 'processing' ? 'bg-blue-400' : ''} onClick={async () => { setProcessing(true); try { const res = await fetch(apiUrl(`/api/admin/payout-batches/${b.id}/process`), { method: 'POST', headers: { ...getAuthHeader() } }); const json = await res.json(); if (!res.ok) throw new Error(json?.error || 'Erreur'); toast({ title: 'Succès', description: 'Batch processed' }); fetchData(); } catch(err: unknown) { toast({ title: 'Erreur', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); } finally { setProcessing(false); } }}>{b.status === 'processing' ? '⏳ En cours...' : 'Traiter'}</Button>
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
              <Table>
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
                  {filterBatches(batches).filter(b => ['completed','failed','cancelled'].includes(b.status || '')).map(b => (
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
              <Table>
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
                        <span className={`px-2 py-1 rounded text-sm ${
                          t.status === 'paid' || t.status === 'SUCCESSFUL' || t.status === 'SUCCESS' 
                            ? 'bg-green-100 text-green-800' 
                            : t.status === 'processing' || t.status === 'PENDING1' || t.status === 'PENDING2'
                            ? 'bg-yellow-100 text-yellow-800'
                            : t.status === 'failed' || t.status === 'FAILED'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {t.status || '-'}
                        </span>
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">ID</TableHead>
                    <TableHead>Commande</TableHead>
                    <TableHead>Produit</TableHead>
                    <TableHead>Acheteur</TableHead>
                    <TableHead>Montant</TableHead>
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
                        <TableCell>{r.order?.products?.name || '-'}</TableCell>
                        <TableCell>{r.buyer?.full_name || '-'}<br /><span className="text-xs text-gray-500">{r.buyer?.phone}</span></TableCell>
                        <TableCell className="font-semibold">{(r.amount || 0).toLocaleString()} FCFA</TableCell>
                        <TableCell>{r.reason || '-'}</TableCell>
                        <TableCell>{r.requested_at ? new Date(r.requested_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="default"
                              className="bg-primary text-primary-foreground"
                              onClick={() => {
                                if (confirm(`Approuver le remboursement de ${(r.amount || 0).toLocaleString()} FCFA pour ${r.buyer?.full_name}?`)) {
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
                      <TableCell colSpan={8} className="text-center text-gray-500">Aucune demande en attente</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {/* Processed Refunds History */}
              <h4 className="font-semibold mt-8 mb-3">Historique des remboursements</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">ID</TableHead>
                    <TableHead>Commande</TableHead>
                    <TableHead>Acheteur</TableHead>
                    <TableHead>Montant</TableHead>
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
                      <TableCell colSpan={8} className="text-center text-gray-500">Aucun historique de remboursement</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    {batchDetailsOpen && <BatchDetailsModal batch={selectedBatch} items={selectedBatchItems} onClose={() => setBatchDetailsOpen(false)} onOpenInvoice={(vendorId) => openInvoiceInModal(`/api/admin/payout-batches/${selectedBatch?.id}/invoice?vendorId=${encodeURIComponent(vendorId)}`, `Facture Batch ${selectedBatch?.id?.slice(0, 8)} - Vendeur`)} />}
    
    {/* Modal Invoice Viewer */}
    {invoiceViewerOpen && (
      <div className="fixed inset-0 z-[60] bg-black bg-opacity-70 flex items-center justify-center backdrop-blur-sm">
        <div className="bg-white rounded-lg w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col shadow-2xl">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="text-lg font-semibold">{invoiceViewerTitle}</h3>
            <div className="flex gap-2">
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
                <Spinner size="lg" />
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
function BatchDetailsModal({ batch, items, onClose, onOpenInvoice }:{ batch: PayoutBatch | null; items: PayoutBatchItem[]; onClose: () => void; onOpenInvoice: (vendorId: string) => void }){
  if (!batch) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-6">
      <div className="bg-white rounded-xl shadow-lg max-w-4xl w-full overflow-auto" style={{ maxHeight: '80vh' }}>
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Détails Batch {batch.id}</h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>Fermer</Button>
          </div>
        </div>
        <div className="p-4">
          <p><strong>Scheduled:</strong> {batch.scheduled_at ? new Date(batch.scheduled_at).toLocaleString() : '-'}</p>
          <p><strong>Status:</strong> {batch.status}</p>
          <p><strong>Commission:</strong> {batch.commission_pct || 0}%</p>

          <div className="mt-4">
            <h4 className="font-semibold mb-2">Items</h4>
            <Table>
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
                    <TableCell>{it.vendor?.full_name || it.vendor_id}</TableCell>
                    <TableCell>{(it.amount||0).toLocaleString()} FCFA</TableCell>
                    <TableCell>{(it.commission_amount||0).toLocaleString()} FCFA</TableCell>
                    <TableCell>{(it.net_amount||0).toLocaleString()} FCFA</TableCell>
                    <TableCell>{it.status}</TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => onOpenInvoice(it.vendor_id || '')}>Invoice</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-lg max-w-3xl w-full overflow-auto" style={{ maxHeight: '80vh' }}>
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
