/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
// Mapping des statuts en français
const STATUS_LABELS_FR: Record<string, string> = {
  paid: 'Payée',
  assigned: 'Assignée',
  in_delivery: 'En livraison',
  delivered: 'Livrée',
  pending: 'En attente',
  cancelled: 'Annulée',
  refunded: 'Remboursée',
  failed: 'Échouée',
};
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '@/components/ui/spinner';
import {
  Package,
  Plus,
  BarChart3,
  ShoppingCart,
  Eye,
  Edit,
  Trash2,
  TrendingUp,
  DollarSign,
  Users,
  LogOut,
  User
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { apiUrl, postProfileUpdate } from '@/lib/api';
import { Product, Order } from '@/types/database';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  StatsCard,
  StatusBadge
} from '@/components/dashboard';
import validelLogo from '@/assets/validel-logo.png';
import { toFrenchErrorMessage } from '@/lib/errors';
import useNetwork from '@/hooks/useNetwork';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { PhoneIcon } from './CustomIcons';
type ProfileRow = {
  full_name: string | null;
  phone: string | null;
  wallet_type?: string | null;
};
const VendorDashboard = () => {
    const { toast } = useToast();
  const { user, signOut, userProfile: authUserProfile, loading } = useAuth();
  const navigate = useNavigate();

  // Sécurité: si l'utilisateur n'est pas connecté ou profil incomplet, rediriger immédiatement
  React.useEffect(() => {
    if (!loading && (!user || !authUserProfile || !authUserProfile.full_name)) {
      navigate('/auth', { replace: true });
    }
  }, [user, authUserProfile, loading, navigate]);

  // Afficher un spinner pendant le chargement initial de l'authentification
  if (loading) {
    return (
      <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-white">
        <Spinner size="xl" className="text-[#24BD5C]" />
        <p className="text-lg font-medium text-gray-700 mt-4">Chargement...</p>
      </div>
    );
  }

  // ...existing code...
  // Correction : lire user depuis sms_auth_session si présent
  type SmsUser = {
    id: string;
    phone: string;
    role: string;
    full_name: string;
    access_token: string;
  } | null;

  const smsSession = typeof window !== 'undefined' ? localStorage.getItem('sms_auth_session') : null;
  let smsUser: SmsUser = null;
  if (smsSession) {
    try {
      const parsed = JSON.parse(smsSession);
      smsUser = {
        id: parsed.profileId,
        phone: parsed.phone,
        role: parsed.role,
        full_name: parsed.fullName,
        access_token: parsed.access_token
      };
    } catch {
      // ignore parse error
    }
  }
  // Utilise smsUser si présent, sinon user
  const effectiveUser = smsUser || user;

  // Helper function to group orders by date
  const groupOrdersByDate = (ordersList: Order[]) => {
    const groups: { [key: string]: Order[] } = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    ordersList.forEach(order => {
      const orderDate = new Date(order.created_at || Date.now());
      orderDate.setHours(0, 0, 0, 0);
      
      let dateKey: string;
      if (orderDate.getTime() === today.getTime()) {
        dateKey = "Aujourd'hui";
      } else if (orderDate.getTime() === yesterday.getTime()) {
        dateKey = "Hier";
      } else {
        // Format: "Lundi 27 Janvier 2026"
        dateKey = orderDate.toLocaleDateString('fr-FR', { 
          weekday: 'long', 
          day: 'numeric', 
          month: 'long', 
          year: 'numeric' 
        });
        // Capitalize first letter
        dateKey = dateKey.charAt(0).toUpperCase() + dateKey.slice(1);
      }
      
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(order);
    });

    // Sort groups by date (most recent first)
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === "Aujourd'hui") return -1;
      if (b === "Aujourd'hui") return 1;
      if (a === "Hier") return -1;
      if (b === "Hier") return 1;
      // For other dates, parse and compare
      const dateA = new Date(groups[a][0].created_at || 0);
      const dateB = new Date(groups[b][0].created_at || 0);
      return dateB.getTime() - dateA.getTime();
    });

    return { groups, sortedKeys };
  };

  // ...existing code...
  // States
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<Array<{id: string; order_id: string; status: string; amount?: number; transaction_type?: string; created_at: string}>>([]);
  const [pageLoading, setPageLoading] = useState<boolean>(true);
  // Modal states
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [callTarget, setCallTarget] = useState<{ phone: string; name?: string } | null>(null);

  // Invoice viewer modal states
  const [invoiceViewerOpen, setInvoiceViewerOpen] = useState(false);
  const [invoiceViewerHtml, setInvoiceViewerHtml] = useState<string | null>(null);
  const [invoiceViewerTitle, setInvoiceViewerTitle] = useState<string>('');
  const [invoiceViewerLoading, setInvoiceViewerLoading] = useState(false);
  const [invoiceViewerFilename, setInvoiceViewerFilename] = useState<string | null>(null);

  // Open an invoice URL and render it inside an in-app modal (supports auth for vendor endpoints)
  async function openInvoiceInModal(url: string, title = 'Facture', requiresAuth = false) {
    try {
      setInvoiceViewerLoading(true);
      setInvoiceViewerTitle(title);
      setInvoiceViewerHtml(null);
      setInvoiceViewerFilename(null);

      let token = (smsUser as any)?.access_token || '';
      if (requiresAuth && !token) {
        try { const s = await supabase.auth.getSession(); token = s?.data?.session?.access_token || ''; } catch (e) { token = ''; }
      }

      const headers: Record<string,string> = { 'Accept': 'text/html, */*' };
      if (requiresAuth && token) headers['Authorization'] = `Bearer ${token}`;

      const fullUrl = url.startsWith('http') ? url : apiUrl(url);
      const resp = await fetch(fullUrl, { method: 'GET', headers });

      if (!resp.ok) {
        if (resp.status === 401) { toast({ title: 'Non autorisé', description: 'Authentification requise pour la facture', variant: 'destructive' }); return; }
        if (resp.status === 404) { toast({ title: 'Introuvable', description: 'Facture introuvable', variant: 'default' }); return; }
        throw new Error(`Backend returned ${resp.status}`);
      }

      const cd = resp.headers.get('content-disposition') || '';
      const m = /filename\s*=\s*"?([^;\\"]+)"?/i.exec(cd);
      const filename = (m && m[1]) ? m[1] : (title.replace(/\s+/g,'-').toLowerCase() + '.html');
      const text = await resp.text();

      setInvoiceViewerFilename(filename);
      setInvoiceViewerHtml(text);
      setInvoiceViewerOpen(true);
    } catch (err) {
      console.error('[VendorDashboard] openInvoiceInModal error', err);
      toast({ title: 'Erreur', description: 'Impossible d\'ouvrir la facture', variant: 'destructive' });
    } finally {
      setInvoiceViewerLoading(false);
    }
  }

  function downloadVisibleInvoice() {
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
      toast({ title: 'Téléchargé', description: 'Facture prête en téléchargement' });
    } catch (err) {
      console.error('[VendorDashboard] downloadVisibleInvoice error', err);
      toast({ title: 'Erreur', description: 'Impossible de télécharger la facture', variant: 'destructive' });
    }
  }

  // Vendor payout batches modal & helpers
  const [batchesModalOpen, setBatchesModalOpen] = useState(false);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [vendorBatches, setVendorBatches] = useState<Array<{id: string; created_at?: string; total_amount?: number; status?: string; item_count?: number; total_net?: number}>>([]);

  async function fetchVendorBatches() {
    try {
      setBatchesLoading(true);
      let token = (smsUser as any)?.access_token || '';
      if (!token) {
        try { const s = await supabase.auth.getSession(); token = s?.data?.session?.access_token || ''; } catch (e) { token = ''; }
      }
      const headers: Record<string,string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const resp = await fetch(apiUrl('/api/vendor/payout-batches'), { method: 'GET', headers });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || !json.success) {
        throw new Error(json?.error || `Backend returned ${resp.status}`);
      }
      setVendorBatches(json.batches || []);
    } catch (err) {
      console.error('[VendorDashboard] fetchVendorBatches error', err);
      toast({ title: 'Erreur', description: 'Impossible de charger les factures de batch', variant: 'destructive' });
    } finally {
      setBatchesLoading(false);
    }
  }

  async function showVendorBatches() {
    try {
      setBatchesModalOpen(true);
      if (!vendorBatches || vendorBatches.length === 0) {
        await fetchVendorBatches();
      }
    } catch (err) {
      console.error('[VendorDashboard] showVendorBatches error', err);
      toast({ title: 'Erreur', description: 'Impossible d\'afficher les factures de paiement', variant: 'destructive' });
    }
  }
  // Form states
  const [newProduct, setNewProduct] = useState({
    name: '',
    price: '',
    description: '',
    warranty: ''
  });
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteProductId, setDeleteProductId] = useState<string | null>(null);
  // Loading states
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Profile states
  const [userProfile, setUserProfile] = useState<{
    full_name?: string;
    phone?: string;
    wallet_type?: string;
  } | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editProfile, setEditProfile] = useState({
    full_name: '',
    phone: '',
    wallet_type: ''
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // (Global spinner overlay and body class logic removed)

  // Harmonized Spinner for all main loading states
  const isPageLoading = pageLoading || loading || adding || editing || deleting || savingProfile;
  // Map DB or cached wallet types to readable labels
  // walletTypeLabel supprimé
  // Ajout d'un état pour le feedback de copie
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  // Network status
  // Détection de l'état en ligne/hors-ligne (corrige l'erreur isOnline)
  const [isOnline, setIsOnline] = useState(
    typeof window !== 'undefined' ? window.navigator.onLine : true
  );
  // Backend availability flag — used to disable backend requests on network errors
  const [backendAvailable, setBackendAvailable] = useState<boolean>(true);

  useEffect(() => {
    function handleOnline() { setIsOnline(true); }
    function handleOffline() { setIsOnline(false); }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  // Nouvelle version : toujours utiliser le backend pour les commandes (comme BuyerDashboard)
  const fetchOrders = useCallback(async () => {
    const caller = smsUser || user;
    if (!caller) return;
    console.log('[VendorDashboard] fetchOrders start for vendor', caller?.id, { backendAvailable });
    try {
      if (!backendAvailable) throw new Error('Backend not available for vendor orders (cached fallback)');
      const token = smsUser?.access_token || localStorage.getItem('sms_auth_session') ? smsUser?.access_token : '';
      // Utilise toujours le backend, même pour les sessions classiques
      const resp = await fetch(apiUrl('/api/vendor/orders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ vendor_id: caller.id })
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || !json.success) {
        setBackendAvailable(false);
        console.warn('[VendorDashboard] backend marked unavailable for orders', { status: resp.status, body: json });
        setTimeout(() => { setBackendAvailable(true); console.info('[VendorDashboard] backend re-enabled after cooldown'); }, 60 * 1000);
        throw new Error(json?.error || `Backend returned ${resp.status}`);
      }
      const data = json.orders || [];
      // Convertir null en undefined pour compatibilité avec le type Order
      const mappedOrders = (data || []).map(o => ({
        ...o,
        delivery_person_id: o.delivery_person_id ?? undefined,
        order_code: o.order_code ?? undefined,
        qr_code: o.qr_code ?? undefined,
        status: o.status ?? undefined,
        payment_confirmed_at: o.payment_confirmed_at ?? undefined,
        assigned_at: o.assigned_at ?? undefined,
        delivered_at: o.delivered_at ?? undefined,
        token: o.token ?? undefined,
        // Propager le numéro de l'acheteur s'il est exposé comme buyer_phone
        profiles: (o.profiles || o.buyer_phone || o.buyer_full_name || (o.buyer && o.buyer.phone)) ? {
          full_name: (o.profiles && o.profiles.full_name) ? o.profiles.full_name : (o.buyer_full_name ?? (o.buyer ? (o.buyer.full_name || '') : '')),
          phone: (o.profiles && o.profiles.phone) ? o.profiles.phone : (o.buyer_phone ?? (o.buyer ? o.buyer.phone : undefined))
        } : undefined
      })) as Order[];
      const filtered = mappedOrders.filter(order => order.status !== 'pending');
      setOrders(filtered);
      console.log('[VendorDashboard] fetchOrders success', filtered.length);
      try { localStorage.setItem(`cached_orders_${caller.id}`, JSON.stringify(filtered)); } catch (e) { /* ignore */ }
    } catch (error: any) {
      const msg = (error && error.message) ? String(error.message) : String(error);
      if (msg.includes('fetch failed') || error.name === 'TypeError' || msg.includes('NetworkError')) {
        console.warn('[VendorDashboard] network error when loading orders, marking backend unavailable', { message: msg.slice(0,200) });
        setBackendAvailable(false);
        setTimeout(() => { setBackendAvailable(true); console.info('[VendorDashboard] backend re-enabled after network cooldown'); }, 60 * 1000);
      }
      // Fallback cache
      try {
        const cached = localStorage.getItem(`cached_orders_${caller?.id}`);
        if (cached) {
          const parsed = JSON.parse(cached) as Order[];
          setOrders(parsed);
          toast({ title: 'Hors-ligne', description: 'Affichage des commandes en cache' });
          return;
        }
      } catch (e) { /* ignore */ }
      console.error('[VendorDashboard] fetchOrders error', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les commandes",
        variant: "destructive",
      });
    }
   
  }, [user, smsUser, toast]);
// ...existing code...
  const fetchProducts = useCallback(async () => {
    const caller = smsUser || user;
    if (!caller) return;
    console.log('[VendorDashboard] fetchProducts start for vendor', caller?.id);

    try {
      // Get token (SMS JWT or Supabase access token)
      let token = (smsUser as any)?.access_token || '';
      if (!token) {
        try {
          const sess = await supabase.auth.getSession();
          token = sess?.data?.session?.access_token || '';
        } catch (e) { token = ''; }
      }

      const resp = await fetch(apiUrl('/api/vendor/products'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ vendor_id: caller.id })
      });

      let j: unknown = null;
      try {
        const ct = resp.headers.get('content-type') || '';
        if (ct.includes('application/json')) j = await resp.json();
      } catch (e) {
        console.warn('[VendorDashboard] /api/vendor/products parse error', e);
      }

      if (!resp.ok || !j || typeof j !== 'object' || !(j as any).success) {
        console.warn('[VendorDashboard] backend /api/vendor/products returned non-ok', { status: resp.status, body: j });
        // fallback to cache
        try {
          const cached = localStorage.getItem(`cached_products_${caller.id}`);
          if (cached) {
            const parsed = JSON.parse(cached) as Product[];
            setProducts(parsed);
            toast({ title: 'Hors-ligne', description: 'Affichage des produits en cache' });
            return;
          }
        } catch (e) { /* ignore */ }
        throw new Error('Backend returned error');
      }

      const productsFromBackend = ((j as any).products || []) as Product[];
      const mappedData = (productsFromBackend || []).map(p => ({
        ...p,
        description: (p as any).description ?? undefined,
        category: (p as any).category ?? undefined,
        image_url: (p as any).image_url ?? undefined,
        stock_quantity: (p as any).stock_quantity ?? undefined,
        is_available: (p as any).is_available ?? true
      })) as Product[];

      if (mappedData.length > 0) {
        try { localStorage.setItem(`cached_products_${caller.id}`, JSON.stringify(mappedData)); } catch (e) { /* ignore */ }
        setProducts(mappedData);
      } else {
        // Empty result: try using recent cache (<5m) and schedule a quick retry
        try {
          const raw = localStorage.getItem(`cached_products_${caller.id}`);
          if (raw) {
            const parsed = JSON.parse(raw) as Product[];
            // no ts on old cache -> accept it
            setProducts(parsed);
            setTimeout(() => { fetchProducts(); }, 2000);
          } else {
            setProducts([]);
          }
        } catch (e) {
          console.warn('[VendorDashboard] cache error while handling empty backend products', e);
          setProducts([]);
        }
      }
    } catch (err) {
      console.error('[VendorDashboard] fetchProducts error', err);
      try {
        const cached = localStorage.getItem(`cached_products_${caller?.id}`);
        if (cached) {
          const parsed = JSON.parse(cached) as Product[];
          setProducts(parsed);
          toast({ title: 'Hors-ligne', description: 'Affichage des produits en cache' });
          return;
        }
      } catch (e) { /* ignore */ }
      toast({ title: 'Erreur', description: 'Impossible de charger les produits', variant: 'destructive' });
    }
  }, [user, smsUser, toast]);
  const fetchTransactions = useCallback(async () => {
    const caller = smsUser || user;
    if (!caller) return;
    console.log('[VendorDashboard] fetchTransactions start for vendor', caller.id);

    try {
      let token = (smsUser as any)?.access_token || '';
      if (!token) {
        try { const sess = await supabase.auth.getSession(); token = sess?.data?.session?.access_token || ''; } catch (e) { token = ''; }
      }

      const url = apiUrl(`/api/vendor/transactions?vendor_id=${caller.id}`);
      const headers: Record<string,string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const resp = await fetch(url, { method: 'GET', headers });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || !json.success) {
        throw new Error((json && json.error) ? String(json.error) : `Backend returned ${resp.status}`);
      }

      const txs = (json.transactions || []) as Array<{id: string; order_id: string; status: string; amount?: number; transaction_type?: string; created_at: string}>;

      const cacheKey = `cached_transactions_${caller.id}`;
      try {
        if (txs.length > 0) {
          localStorage.setItem(cacheKey, JSON.stringify({ transactions: txs, ts: Date.now() }));
          setTransactions(txs);
        } else {
          const raw = localStorage.getItem(cacheKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.transactions && (Date.now() - (parsed.ts || 0) < 5 * 60 * 1000)) {
              console.warn('[VendorDashboard] backend returned empty transactions — using cached transactions to avoid flicker');
              setTransactions(parsed.transactions);
              setTimeout(() => { fetchTransactions(); }, 2000);
            } else {
              setTransactions([]);
            }
          } else {
            setTransactions([]);
          }
        }
      } catch (e) {
        console.warn('[VendorDashboard] cache error:', e);
        setTransactions(txs);
      }
    } catch (error) {
      console.error('[VendorDashboard] fetchTransactions error', error);
      // Try cached transactions
      try {
        const cached = localStorage.getItem(`cached_transactions_${caller?.id}`);
        if (cached) {
          const parsed = JSON.parse(cached) as any;
          if (parsed && parsed.transactions) {
            setTransactions(parsed.transactions);
            toast({ title: 'Hors-ligne', description: 'Affichage des transactions en cache' });
            return;
          }
        }
      } catch (e) { /* ignore */ }
    }

  }, [user, smsUser, toast]);

  // Download a vendor invoice (payout batch). Uses auth to fetch protected invoice endpoint and force download.
  async function handleDownloadInvoice(url: string) {
    try {
      let token = (smsUser as any)?.access_token || '';
      if (!token) {
        try { const s = await supabase.auth.getSession(); token = s?.data?.session?.access_token || ''; } catch (e) { token = ''; }
      }
      const fullUrl = url.startsWith('http') ? url : apiUrl(url);
      const headers: Record<string, string> = { 'Accept': '*/*' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const resp = await fetch(fullUrl, { method: 'GET', headers });
      if (!resp.ok) {
        toast({ title: 'Erreur', description: 'Impossible de télécharger la facture', variant: 'destructive' });
        return;
      }
      const blob = await resp.blob();
      // Try to extract filename from content-disposition
      let filename = 'invoice.html';
      const cd = resp.headers.get('content-disposition') || '';
      const m = /filename\s*=\s*"?([^;"]+)"?/i.exec(cd);
      if (m && m[1]) filename = m[1];
      const urlObj = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = urlObj;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(urlObj);
      toast({ title: 'Téléchargé', description: 'Facture prête en téléchargement' });
    } catch (err) {
      console.error('[VendorDashboard] download invoice error', err);
      toast({ title: 'Erreur', description: 'Erreur téléchargement facture', variant: 'destructive' });
    }
  }

  // Download the latest vendor payout batch invoice and force download
  async function handleDownloadLatestBatchInvoice() {
    try {
      let token = (smsUser as any)?.access_token || '';
      if (!token) {
        try { const s = await supabase.auth.getSession(); token = s?.data?.session?.access_token || ''; } catch (e) { token = ''; }
      }
      const headers: Record<string,string> = { 'Accept': '*/*' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const resp = await fetch(apiUrl('/api/vendor/payout-batches/latest-invoice'), { method: 'GET', headers });

      if (resp.status === 404) {
        toast({ title: 'Aucune facture', description: 'Il n\'y a pas de facture de batch pour le moment', variant: 'default' });
        return;
      }
      if (resp.status === 401) {
        toast({ title: 'Non autorisé', description: 'Authentification requise pour télécharger la facture', variant: 'destructive' });
        return;
      }
      if (!resp.ok) {
        toast({ title: 'Erreur', description: 'Impossible de télécharger la facture de batch', variant: 'destructive' });
        return;
      }
      const blob = await resp.blob();
      let filename = 'batch-invoice.html';
      const cd = resp.headers.get('content-disposition') || '';
      const m = /filename\s*=\s*"?([^;"]+)"?/i.exec(cd);
      if (m && m[1]) filename = m[1];
      const urlObj = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = urlObj;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(urlObj);
      toast({ title: 'Téléchargé', description: 'Facture de paiement prête en téléchargement' });
    } catch (err) {
      console.error('[VendorDashboard] download latest batch invoice error', err);
      toast({ title: 'Erreur', description: 'Erreur téléchargement facture de batch', variant: 'destructive' });
    }
  }

  // Fetch profile (keeps parity with BuyerDashboard)
  const fetchProfile = useCallback(async () => {
    if (!user?.id) {
      setUserProfile(null);
      setEditProfile({ full_name: '', phone: '', wallet_type: '' });
      return;
    }

    const smsSessionStr = typeof window !== 'undefined' ? localStorage.getItem('sms_auth_session') : null;
    if (smsSessionStr) {
      if (authUserProfile) {
        setUserProfile({ full_name: authUserProfile.full_name ?? '', phone: authUserProfile.phone ?? '', wallet_type: authUserProfile.wallet_type ?? '' });
        setEditProfile({ full_name: authUserProfile.full_name ?? '', phone: authUserProfile.phone ?? '', wallet_type: authUserProfile.wallet_type ?? '' });
      } else {
        setUserProfile(null);
        setEditProfile({ full_name: '', phone: '', wallet_type: '' });
      }
      return;
    }

    try {
      try {
        await supabase.auth.getSession().catch(() => {});
        await supabase.auth.getUser().catch(() => {});
      } catch {
        // ignore
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, phone, wallet_type')
        .eq('id', user.id)
        .single();

      if (!error && data) {
        setUserProfile({ full_name: data.full_name ?? '', phone: data.phone ?? '', wallet_type: data.wallet_type ?? '' });
        setEditProfile({ full_name: data.full_name ?? '', phone: data.phone ?? '', wallet_type: data.wallet_type ?? '' });
        console.log('[VendorDashboard] fetchProfile success');
      } else {
        console.error('[VendorDashboard] fetchProfile error', error);
        // Try to create the profile if missing
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({ id: user.id, full_name: '', phone: user.phone || '', role: 'vendor' });
        if (!insertError) {
          setUserProfile({ full_name: '', phone: user.phone || '', wallet_type: '' });
        }
        setEditProfile({ full_name: '', phone: user.phone || '', wallet_type: '' });
      }
    } catch (err) {
      console.error('[VendorDashboard] unexpected error fetchProfile', err);
      setUserProfile(null);
      setEditProfile({ full_name: '', phone: '', wallet_type: '' });
    }
  }, [user, authUserProfile]);
  // Profile auto-creation logic (like BuyerDashboard)
  useEffect(() => {
    if (!user) return;
    
    let isMounted = true;
    
    const fetchData = async () => {
      if (!isMounted) return;
      
      console.log('[VendorDashboard] fetchData start (init)');
      setPageLoading(true);
      
      try {
        // fetchOrCreateProfile directement ici (sans dépendance)
        if (user?.id) {
          const { data, error } = await supabase
            .from('profiles')
            .select('full_name, phone, wallet_type')
            .eq('id', user.id)
            .maybeSingle();
          
          if (!error && data) {
            setUserProfile({
              full_name: (data as any).full_name ?? '',
              phone: (data as any).phone ?? '',
              wallet_type: (data as any).wallet_type ?? ''
            });
            setEditProfile({
              full_name: (data as any).full_name ?? '',
              phone: (data as any).phone ?? '',
              wallet_type: (data as any).wallet_type ?? ''
            });
          }
        }
        
        // Appels directs (ne pas utiliser les fonctions fetch comme dépendances)
        const productsPromise = fetchProducts();
        const ordersPromise = fetchOrders();
        const transactionsPromise = fetchTransactions();
        const profilePromise = fetchProfile();
        
        await Promise.allSettled([
          productsPromise,
          ordersPromise,
          transactionsPromise,
          profilePromise
        ]);
        
      } catch (err) {
        console.error('[VendorDashboard] fetchData error', err);
        if (isMounted) {
          toast({ 
            title: 'Erreur', 
            description: 'Impossible de charger certaines données', 
            variant: 'destructive' 
          });
        }
      } finally {
        if (isMounted) {
          console.log('[VendorDashboard] fetchData finished');
          setPageLoading(false);
        }
      }
    };
    
    fetchData();
    
    return () => {
      isMounted = false;
    };
  }, [user]); // SEULEMENT 'user' comme dépendance

  // Debug: log loading flags to help identify which stays true (not nested)
  React.useEffect(() => {
    console.log('DEBUG - isPageLoading breakdown:', {
      pageLoading,
      loading,
      adding,
      editing,
      deleting,
      savingProfile,
      total: isPageLoading
    });
  }, [pageLoading, loading, adding, editing, deleting, savingProfile, isPageLoading]);
  // Live updates: écoute les changements sur les commandes du vendeur
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`orders-vendor-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `vendor_id=eq.${user.id}` },
        (payload) => {
          console.log('VendorDashboard: Changement orders détecté', payload);
          fetchOrders();
          fetchTransactions();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_transactions' },
        (payload) => {
          console.log('VendorDashboard: Changement transactions détecté', payload);
          fetchTransactions();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchOrders, fetchTransactions]);
  // Suppression de l'effet ensureWalletType
  const generateProductCode = async () => {
    // Générer un code produit unique: PD + 4 chiffres aléatoires
    const randomNumber = Math.floor(1000 + Math.random() * 9000);
    return `PD${randomNumber}`;
  };
  // Détection session SMS
  const isSMSAuth = () => {
    return !!(typeof window !== 'undefined' && localStorage.getItem('sms_auth_session'));
  };

  const handleAddProduct = async () => {
    if (!newProduct.name || !newProduct.price || !newProduct.description) {
      toast({
        title: 'Erreur',
        description: 'Veuillez remplir tous les champs obligatoires',
        variant: 'destructive'
      });
      return;
    }
    setAdding(true);
    try {
      let insertOk = false;
      let insertError: string | null = null;
      const code = await generateProductCode();
      if (!effectiveUser?.id) {
        throw new Error('Utilisateur non identifié');
      }
      // Utilise le backend sécurisé avec le token JWT si session SMS
      const token = smsUser?.access_token || '';
      let productResp: { success?: boolean; error?: string } | null = null;
      if (smsUser) {
        // Log pour debug
        console.log('Token envoyé:', token);
        const resp = await fetch(apiUrl('/api/vendor/add-product'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            vendor_id: effectiveUser.id,
            name: newProduct.name,
            price: parseInt(newProduct.price),
            description: newProduct.description,
            warranty: newProduct.warranty,
            code,
            is_available: true,
            stock_quantity: 0
          })
        });
        productResp = await resp.json();
        if (!resp.ok || !productResp || !productResp.success) {
          insertError = productResp && typeof productResp.error === 'string' ? productResp.error : 'Erreur lors de l\'ajout du produit (backend)';
        } else {
          insertOk = true;
        }
      } else {
        // Utilisateur Supabase classique
        const { data: insertData, error } = await supabase
          .from('products')
          .insert({
            vendor_id: effectiveUser.id,
            name: newProduct.name,
            price: parseInt(newProduct.price),
            description: newProduct.description,
            warranty: newProduct.warranty,
            code,
            is_available: true,
            stock_quantity: 0
          });
        if (error) {
          if ((error as any)?.status === 401 || (error as any)?.message?.toLowerCase?.().includes('unauthorized')) {
            toast({ title: 'Session expirée', description: 'Vous devez vous reconnecter pour ajouter un produit', variant: 'destructive' });
            await signOut();
            navigate('/auth');
            return;
          }
          insertError = error.message ? String(error.message) : 'Erreur lors de l\'ajout du produit';
        } else {
          insertOk = true;
        }
      }
      if (insertOk) {
        toast({
          title: 'Succès',
          description: 'Produit ajouté avec succès'
        });
        setNewProduct({ name: '', price: '', description: '', warranty: '' });
        setAddModalOpen(false);
        fetchProducts();
      } else {
        throw new Error(insertError || 'Erreur lors de l\'ajout du produit');
      }
    } catch (error: unknown) {
      console.error('handleAddProduct error:', error);
      const msg = (error && typeof error === 'object' && 'message' in error) ? (error as any).message : String(error || 'Erreur inconnue');
      toast({
        title: 'Erreur',
        description: msg || 'Impossible d\'ajouter le produit',
        variant: 'destructive'
      });
    } finally {
      setAdding(false);
    }
  };
  const handleEditProduct = async () => {
    if (!editProduct) return;
    setEditing(true);
    try {
      const smsSessionStr = typeof window !== 'undefined' ? localStorage.getItem('sms_auth_session') : null;
      if (smsSessionStr) {
        const sms = JSON.parse(smsSessionStr);
        const token = sms.access_token;
        if (!token) throw new Error('Token d\'authentification manquant. Veuillez vous reconnecter.');
        const updates = {
          name: editProduct.name,
          price: parseInt(String(editProduct.price)),
          description: editProduct.description,
          warranty: editProduct.warranty
        };
        const resp = await fetch(apiUrl('/api/vendor/update-product'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ vendor_id: sms.profileId, product_id: editProduct.id, updates })
        });
        // If the server returns 401, surface a clear message and force re-login
        if (resp.status === 401) {
          let errJson: any = null;
          try { errJson = await resp.json(); } catch (e) { /* ignore */ }
          const msg = (errJson && errJson.error) ? errJson.error : 'Session invalide ou expirée. Veuillez vous reconnecter.';
          throw new Error(msg);
        }
        const json = await resp.json().catch(() => null);
        if (!resp.ok || !json || !json.success) {
          const errMsg = json?.error || 'Erreur lors de la modification du produit (backend)';
          throw new Error(errMsg);
        }
      } else {
        const { data, error } = await supabase
          .from('products')
          .update({
            name: editProduct.name,
            price: parseInt(String(editProduct.price)),
            description: editProduct.description,
            warranty: editProduct.warranty
          })
          .eq('id', editProduct.id)
          .select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Produit introuvable ou non modifié');
      }
      toast({ title: 'Succès', description: 'Produit modifié avec succès' });
      setEditModalOpen(false);
      setEditProduct(null);
      fetchProducts();
    } catch (error) {
      console.error('handleEditProduct error:', error);
      const message = (error as any)?.message || 'Impossible de modifier le produit';
      // If it's a session issue, suggest reconnect and sign out the user
      if (message.toLowerCase().includes('session invalide') || message.toLowerCase().includes('session expir')) {
        toast({ title: 'Session invalide', description: 'Votre session est invalide. Veuillez vous reconnecter.', variant: 'destructive' });
        try { await signOut(); } catch (e) { /* ignore */ }
      } else {
        toast({ title: 'Erreur', description: message, variant: 'destructive' });
      }
    } finally {
      setEditing(false);
    }
  };
  const handleDeleteProduct = async () => {
    if (!deleteProductId) return;
    setDeleting(true);
    try {
      const smsSessionStr = typeof window !== 'undefined' ? localStorage.getItem('sms_auth_session') : null;
      // If SMS session, use backend admin endpoint to delete (bypass RLS)
      if (smsSessionStr) {
        const sms = JSON.parse(smsSessionStr);
        const token = sms.access_token;
        if (!token) throw new Error('Token d\'authentification manquant. Veuillez vous reconnecter.');
        const resp = await fetch(apiUrl('/api/vendor/delete-product'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ vendor_id: sms.profileId, product_id: deleteProductId })
        });
        const json = await resp.json().catch(() => null);
        if (!resp.ok || !json || !json.success) {
          const errMsg = json?.error || 'Erreur lors de la suppression du produit (backend)';
          throw new Error(errMsg);
        }
      } else {
        const { data, error } = await supabase
          .from('products')
          .delete()
          .eq('id', deleteProductId)
          .select();
        if (error) throw error;
        // Ensure a row was actually deleted
        if (!data || data.length === 0) {
          throw new Error('Produit introuvable ou non supprimé');
        }
      }
      toast({ title: 'Succès', description: 'Produit supprimé avec succès' });
      setDeleteDialogOpen(false);
      setDeleteProductId(null);
      fetchProducts();
    } catch (error) {
      console.error('handleDeleteProduct error:', error);
      toast({ title: 'Erreur', description: (error as any)?.message || 'Impossible de supprimer le produit', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };
  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setEditProfile({ ...editProfile, [e.target.name]: e.target.value });
  };
  const handleSaveProfile = async () => {
    if (!user?.id) {
      toast({
        title: 'Erreur',
        description: 'Utilisateur non connecté',
        variant: 'destructive'
      });
      return;
    }
  
    setSavingProfile(true);
    try {
      const smsSessionStr = typeof window !== 'undefined' ? localStorage.getItem('sms_auth_session') : null;
      if (smsSessionStr) {
        // Use backend admin endpoint for SMS-auth users
        console.log('[DEBUG] VendorDashboard: updating profile via backend for SMS session', { id: user.id });
        const { ok, json, error, url } = await postProfileUpdate({ profileId: user.id, full_name: editProfile.full_name, phone: editProfile.phone, wallet_type: editProfile.wallet_type });
        console.log('[DEBUG] VendorDashboard profile update via backend result', { ok, url, error });
        if (!ok) throw new Error(`Backend update failed: ${JSON.stringify(error)}`);
        const saved = json?.profile ?? json;

        try {
          const cachedRaw = localStorage.getItem('auth_cached_profile_v1');
          const cacheObj = cachedRaw ? JSON.parse(cachedRaw) : { id: user.id, email: user.email || '', full_name: editProfile.full_name, phone: editProfile.phone, role: 'vendor' };
          cacheObj.full_name = saved?.full_name ?? editProfile.full_name;
          cacheObj.phone = saved?.phone ?? editProfile.phone;
          cacheObj.wallet_type = saved?.wallet_type ?? editProfile.wallet_type;
          localStorage.setItem('auth_cached_profile_v1', JSON.stringify(cacheObj));
        } catch (e) {
          console.warn('[DEBUG] failed to update cached profile after save', e);
        }

        setUserProfile({
          full_name: saved?.full_name ?? editProfile.full_name,
          phone: saved?.phone ?? editProfile.phone,
          wallet_type: saved?.wallet_type ?? editProfile.wallet_type
        });
        setIsEditingProfile(false);
        toast({ title: 'Succès', description: 'Profil mis à jour avec succès' });
      } else {
        console.log('Mise à jour profil vendeur pour user:', user.id);
        console.log('Données:', { full_name: editProfile.full_name, phone: editProfile.phone, wallet_type: editProfile.wallet_type });

        const { data, error } = await supabase
          .from('profiles')
          .update({
            full_name: editProfile.full_name,
            phone: editProfile.phone,
            wallet_type: editProfile.wallet_type
          })
          .eq('id', user.id)
          .select();
        console.log('Résultat update:', { data, error });
        if (error) {
          console.error('Erreur Supabase détaillée:', { code: error.code, details: error.details, hint: error.hint, message: error.message });
          throw error;
        }
        toast({
          title: 'Succès',
          description: 'Profil mis à jour avec succès'
        });
        // If DB returned the updated row, prefer the saved wallet_type; otherwise keep the edited value
        const updated = (data && data[0]) ? data[0] : null;
        setUserProfile({
          full_name: updated?.full_name ?? editProfile.full_name,
          phone: updated?.phone ?? editProfile.phone,
          wallet_type: updated?.wallet_type ?? editProfile.wallet_type
        });
        setIsEditingProfile(false);
      }
    } catch (error: unknown) {
      console.error('Erreur sauvegarde profil:', error);
      const errorMessage = toFrenchErrorMessage(error, 'Erreur inconnue');
      toast({
        title: 'Erreur',
        description: `Impossible de mettre à jour le profil: ${errorMessage}`,
        variant: 'destructive'
      });
    } finally {
      setSavingProfile(false);
    }
  };
  // Fonction pour copier le code produit
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1200);
  };

  // Appeler le client : si le numéro n'est pas présent dans order.profiles,
  // essayer de le récupérer depuis la table `profiles` via buyer_id
  const handleCallClient = async (order: Order) => {
    try {
      // Vérifier plusieurs emplacements possibles du numéro
      const phoneFromOrder = order.profiles?.phone || (order as any).buyer_phone || (order as any).phone || (order as any).buyer?.phone || null;
      if (phoneFromOrder) {
        if (typeof window !== 'undefined') window.location.href = `tel:${phoneFromOrder}`;
        return;
      }
      // Fallback : lire le profil de l'acheteur depuis Supabase
      const buyerId = (order as any).buyer_id || (order as any).buyer || null;
      if (!buyerId) {
        toast({ title: 'Aucun numéro', description: 'Numéro de téléphone introuvable', variant: 'destructive' });
        return;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', buyerId)
        .maybeSingle();
      if (!error && data && data.phone) {
        if (typeof window !== 'undefined') window.location.href = `tel:${data.phone}`;
        return;
      }
      toast({ title: 'Aucun numéro', description: 'Numéro de téléphone introuvable', variant: 'destructive' });
    } catch (err) {
      console.error('[VendorDashboard] handleCallClient error', err);
      toast({ title: 'Erreur', description: 'Impossible de récupérer le numéro', variant: 'destructive' });
    }
  };

  // Ouvre WhatsApp pour le client (même logique fallback que pour l'appel)

  // Calculate stats
  const totalProducts = products.length;
  const activeProducts = products.filter(p => p.is_available).length;
  const totalOrders = orders.length;
  const totalRevenue = orders
    .filter(o => o.status === 'delivered')
    .reduce((sum, o) => sum + (o.total_amount || 0), 0);
  // wallet_type supprimé
  // Fonction pour déconnexion (déclarée avant tout return pour respecter les Hooks rules)
  const [signingOut, setSigningOut] = React.useState(false);
  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      await signOut();
      toast({ title: 'Déconnecté', description: 'Vous avez été déconnecté avec succès' });
      // Ensure redirect to auth page
      navigate('/auth');
    } catch (err) {
      console.error('Erreur lors de la déconnexion:', err);
      toast({ title: 'Erreur', description: 'Impossible de se déconnecter pour le moment', variant: 'destructive' });
    } finally {
      setSigningOut(false);
    }
  };

  // (Global overlay spinner removed)
  // Suppression du rendu conditionnel de chargement (plus d'overlay, plus de texte 'Chargement...')
  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0 relative">
      {/* Header Moderne - Style similaire à BuyerDashboard */}
      <header className="bg-green-600 rounded-b-2xl shadow-lg mb-6">
        <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col items-center justify-center">
          <h1 className="text-3xl md:text-4xl font-extrabold text-white drop-shadow-lg text-center tracking-tight">
            Validèl
          </h1>
          <p className="text-white/90 text-sm mt-1">Espace Vendeur(se)</p>
        </div>
      </header>
      {/* Offline banner */}
      {!isOnline && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <div className="bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 px-4 py-2 rounded">⚠️ Hors-ligne — affichage des données en cache</div>
        </div>
      )}
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8">
      {/* ...section stats supprimée... */}
      {/* Navigation - Desktop Tabs */}
      <div className="hidden md:block">
        <Tabs defaultValue="products" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="products" className="flex items-center space-x-2">
              <Package className="h-4 w-4" />
              <span>Mes Produits</span>
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex items-center space-x-2">
              <ShoppingCart className="h-4 w-4" />
              <span>Commandes</span>
            </TabsTrigger>
            <TabsTrigger value="profile" className="flex items-center space-x-2">
              <User className="h-4 w-4" />
              <span>Compte</span>
            </TabsTrigger>
          </TabsList>
        {/* Products Tab */}
        <TabsContent value="products" className="space-y-6">
          <div className="flex justify-between items-center gap-2">
            <h2 className="text-lg md:text-xl font-bold text-gray-900 flex-shrink-0">Mes Produits ({products.length})</h2>
            {products.length > 0 && (
              <Button
                onClick={() => setAddModalOpen(true)}
                className="bg-green-500 hover:bg-green-600 text-white shadow-md flex-shrink-0 text-sm px-4 py-2"
              >
                <Plus className="h-4 w-4 mr-2" />
                Ajouter
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {products.map((product) => (
              <Card
                key={product.id}
                className="hover:shadow-lg transition-shadow h-fit"
                style={{ maxWidth: "100%", boxSizing: "border-box" }} // Empêche le débordement
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{product.name}</CardTitle>
                    <StatusBadge
                      status={product.is_available ? 'active' : 'inactive'}
                      size="sm"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                    {product.description}
                  </p>
                
                  {/* Code Produit - Format texte simple avec bouton copier */}
                  <div className="flex items-center mb-2">
                    <span
                      className="font-mono"
                      style={{
                        fontSize: "22px",
                        fontWeight: 700,
                        color: "#333",
                        letterSpacing: "1px",
                        marginRight: 8,
                        userSelect: "all"
                      }}
                    >
                      Code : {product.code || `PROD-${product.id}`}
                    </span>
                    {/* Bouton Copier supprimé */}
                  </div>
                
                  <div className="space-y-2 mb-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Prix:</span>
                      <span className="font-semibold text-green-600">
                        {product.price?.toLocaleString()} CFA
                      </span>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setEditProduct({
                          ...product,
                          price: product.price || 0
                        });
                        setEditModalOpen(true);
                      }}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Modifier
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDeleteProductId(product.id);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Supprimer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {products.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Package className="h-10 w-10 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">Aucun produit pour le moment.</p>
              <div className="mt-3">
                <Button
                  onClick={() => setAddModalOpen(true)}
                  className="bg-green-500 hover:bg-green-600 text-sm px-3 py-1"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter un produit
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
        {/* Orders Tab */}
        <TabsContent value="orders" className="space-y-6">
          <div className="flex items-center justify-between gap-3 flex-nowrap">
            <div className="flex items-center gap-1 whitespace-nowrap">
              <h3 className="text-xs md:text-sm font-semibold text-gray-900 m-0 leading-none">Commandes</h3>
              <span className="text-[11px] md:text-xs text-gray-600 font-medium leading-none">({totalOrders})</span>
            </div>
            <div>
              <Button size="sm" onClick={showVendorBatches} className="bg-yellow-100 text-yellow-800 text-[11px] px-2 py-0.5 rounded-md h-7">
                Facture paiement
              </Button>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Commandes récentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {orders.map((order) => {
                  // Trouver la transaction de paiement associée à cette commande
                  const payoutTransaction = transactions.find(t => t.order_id === order.id);
                  return (
                    <div
                      key={order.id}
                      className="rounded-xl border border-orange-100 bg-[#FFF9F3] p-4 flex flex-col gap-2 shadow-sm"
                      style={{ maxWidth: 350 }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span role="img" aria-label="box" className="text-green-600 text-lg">📦</span>
                          <span className="font-bold text-lg text-gray-900">{order.products?.name}</span>
                        </div>
                        <span className="font-bold" style={{ color: "#11B122", fontSize: 16 }}>
                          {order.total_amount ? order.total_amount.toLocaleString() + " FCFA" : "Ex : 50 000"}
                        </span>
                      </div>
                      <div className="flex items-center mb-1">
                        <span className="text-sm font-semibold text-gray-800">Code commande :</span>
                        <span className="text-base font-mono font-bold text-orange-600" style={{letterSpacing:'1px',fontSize:'18px', marginLeft: 8}}>{order.order_code || order.id}</span>
                      </div>
                      {/* ...statut déplacé en bas... */}
                      <div className="flex items-center text-sm text-gray-800 mb-1">
                        <strong>Client :</strong>
                        <div style={{ marginLeft: 8 }}>
                          <button
                            type="button"
                            onClick={() => handleCallClient(order)}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-[11px] font-medium hover:bg-blue-100 transition min-w-[56px]"
                            aria-label="Appeler ce client"
                          >
                            <PhoneIcon className="h-4 w-4" />
                            <span className="ml-1 text-[11px] leading-tight">Appeler ce client</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center text-sm text-gray-800 mb-1">
                        <strong>Adresse :</strong>
                        <span className="text-gray-700" style={{ marginLeft: 8 }}>{order.delivery_address || (order as any).buyer?.address || (order as any).buyer_address || 'Adresse à définir'}</span>
                      </div>

                      <div className="flex items-center mb-1 mt-2">
                        <span className="text-sm font-semibold text-gray-800">Statut commande :</span>
                        <span className="text-xs font-bold text-white" style={{background:'#2563eb',borderRadius:12,padding:'2px 5px',fontSize:'11px',letterSpacing:'1px',textTransform:'capitalize',boxShadow:'0 1px 4px #2563eb22', marginLeft: 8}}>
                          {order.status && STATUS_LABELS_FR[order.status as keyof typeof STATUS_LABELS_FR] || order.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {orders.length === 0 && (
                <div className="text-center py-8">
                  <ShoppingCart className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-500">Aucune commande pour le moment</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-900">Statistiques</h2>
        
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2 text-green-500" />
                  Performances
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Taux de conversion</span>
                    <span className="font-semibold">12.5%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Commandes complétées</span>
                    <span className="font-semibold">89%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Note moyenne</span>
                    <span className="font-semibold">4.8/5</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="h-5 w-5 mr-2 text-green-500" />
                  Clients
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Nouveaux clients</span>
                    <span className="font-semibold">+24</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Clients récurrents</span>
                    <span className="font-semibold">67%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total clients</span>
                    <span className="font-semibold">156</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-900">Mon Profil</h2>
        
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Informations personnelles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isEditingProfile ? (
                  <>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Nom complet</label>
                      <p className="text-lg">{userProfile?.full_name || 'Non renseigné'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Téléphone</label>
                      <p className="text-lg">{userProfile?.phone || 'Non renseigné'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Compte de paiement</label>
                      <p className="text-lg">
                        {userProfile?.wallet_type === 'wave-senegal' ? 'Wave' : userProfile?.wallet_type === 'orange-money' ? 'Orange Money' : 'Non défini'}
                      </p>
                    </div>
                    <Button
                      onClick={() => setIsEditingProfile(true)}
                      className="bg-green-500 hover:bg-green-600"
                    >
                      Modifier le profil
                    </Button>
                    <Button
                      onClick={async () => {
                        await fetchProfile();
                        toast({ title: 'Profil rafraîchi', description: 'Vérifiez le type de wallet.' });
                      }}
                      variant="outline"
                      className="mt-2"
                    >
                      Rafraîchir profil
                    </Button>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="text-sm font-medium">Nom complet</label>
                      <Input
                        name="full_name"
                        value={editProfile.full_name}
                        onChange={handleProfileChange}
                        placeholder="Votre nom complet"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Téléphone</label>
                      <Input
                        name="phone"
                        value={editProfile.phone}
                        onChange={handleProfileChange}
                        placeholder="Numéro de téléphone"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Wallet utilisé</label>
                      <p className="text-lg">
                        {userProfile?.wallet_type === 'wave-senegal' ? 'Wave' : userProfile?.wallet_type === 'orange-money' ? 'Orange Money' : 'Non défini'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Compte de paiement</label>
                      <select
                        name="wallet_type"
                        value={editProfile.wallet_type}
                        onChange={e => setEditProfile(p => ({ ...p, wallet_type: e.target.value }))}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 mt-1"
                        title="Type de compte de paiement pour recevoir les paiements"
                      >
                        <option value="">Choisir un compte...</option>
                        <option value="wave-senegal">Wave</option>
                        <option value="orange-money">Orange Money</option>
                      </select>
                    </div>
                    <div className="flex space-x-2 mt-4">
                      <Button
                        onClick={handleSaveProfile}
                        disabled={savingProfile}
                        className="bg-green-500 hover:bg-green-600"
                      >
                        {savingProfile ? 'Enregistrement...' : 'Enregistrer'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setIsEditingProfile(false)}
                      >
                        Annuler
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Paramètres du compte</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Statut du compte</label>
                  <StatusBadge status="active" size="sm" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Date d'inscription</label>
                  <p className="text-lg">
                    {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Non disponible'}
                  </p>
                </div>
                {/* Wallet utilisé supprimé */}
                <div>
                  <label className="text-sm font-medium text-gray-500">Rôle</label>
                  <p className="text-lg">Vendeur(se)</p>
                </div>
                <Button
                  variant="destructive"
                  onClick={handleSignOut}
                  disabled={signingOut}
                >
                  {signingOut ? 'Déconnexion...' : 'Se déconnecter'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      </div>
      {/* Navigation Mobile - Bottom Navigation Bar */}
      <div className="md:hidden">
        <Tabs defaultValue="products" className="pb-20 px-4">
          <div className="space-y-6">
            <TabsContent value="products" className="mt-0">
              <div className="space-y-6">
                <div className="flex justify-between items-center gap-2">
                  <h2 className="text-base font-semibold flex-shrink-0">Mes Produits ({products.length})</h2>
                  {products.length > 0 && (
                    <Button
                      onClick={() => setAddModalOpen(true)}
                      className="bg-green-500 hover:bg-green-600 text-white shadow-md flex-shrink-0 text-xs px-3 py-2"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Ajouter
                    </Button>
                  )}
                </div>
                <div className="grid gap-4">
                  {products.map((product) => (
                    <Card
                      key={product.id}
                      className="border border-gray-200 relative"
                      style={{
                        width: "100%",
                        maxWidth: "calc(100vw - 32px)",
                        boxSizing: "border-box",
                        marginRight: 'auto',
                        marginLeft: 'auto',
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <h3
                              className="font-medium truncate"
                              style={{
                                fontSize: "13px",
                                lineHeight: "1.2",
                                maxWidth: "90%",
                              }}
                              title={product.name}
                            >
                              {product.name}
                            </h3>
                            <p className="text-sm text-gray-600 mt-1 break-words whitespace-normal">{product.description}</p>

                            <div
                              className="flex items-center mb-2"
                              style={{
                                fontSize: "12px",
                                fontWeight: 700,
                                wordBreak: "break-all",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: "100%",
                              }}
                              title={product.code || `PROD-${product.id}`}
                            >
                              <span className="font-mono" style={{ fontSize: "18px", fontWeight: 700 }}>
                                Code : {product.code || `PROD-${product.id}`}
                              </span>
                            </div>
                            <div className="mt-2">
                              <span className="text-sm font-medium text-green-600 whitespace-nowrap">{product.price} CFA</span>
                            </div>
                          </div>
                        </div>
                        {/* Boutons en bas côte-à-côte sur mobile */}
                        <div className="mt-4 flex gap-2">
                          <Button onClick={() => { setEditProduct(product); setEditModalOpen(true); }} className="flex-1 bg-green-500 hover:bg-green-600 text-sm">
                            Modifier
                          </Button>
                          <Button onClick={() => { setDeleteProductId(product.id); setDeleteDialogOpen(true); }} variant="outline" className="flex-1 text-sm">
                            Supprimer
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {products.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Package className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm">Commencez par ajouter un produit.</p>
                    <div className="mt-3">
                      <Button onClick={() => setAddModalOpen(true)} className="bg-green-500 hover:bg-green-600 text-sm px-3 py-1">
                        <Plus className="h-4 w-4 mr-2" />
                        Ajouter un produit
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="orders" className="mt-0">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    <h4 className="text-xs font-semibold m-0 leading-none">Commandes</h4>
                    <span className="text-xs text-gray-600 leading-none">({totalOrders})</span>
                  </div>
                  <Button size="sm" onClick={showVendorBatches} className="bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-md h-7">
                    Facture paiement
                  </Button>
                </div>
                
                {/* Orders grouped by date */}
                {orders.length > 0 && (() => {
                  const { groups, sortedKeys } = groupOrdersByDate(orders);
                  return (
                    <div className="space-y-6">
                      {sortedKeys.map((dateKey) => (
                        <div key={dateKey}>
                          {/* Date header */}
                          <div className="flex items-center gap-3 mb-3">
                            <div className="flex-shrink-0 bg-gradient-to-r from-orange-500 to-orange-400 text-white px-3 py-1.5 rounded-lg shadow-sm">
                              <span className="text-sm font-semibold">{dateKey}</span>
                            </div>
                            <div className="flex-grow h-px bg-gradient-to-r from-orange-200 to-transparent"></div>
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                              {groups[dateKey].length} commande{groups[dateKey].length > 1 ? 's' : ''}
                            </span>
                          </div>
                          
                          {/* Orders for this date */}
                          <div className="grid gap-4">
                            {groups[dateKey].map((order) => (
                              <Card key={order.id} className="border border-orange-100 bg-[#FFF9F3] rounded-xl shadow-sm">
                                <CardContent className="p-4">
                                  {/* Ligne 1 : Icône + nom produit + prix à droite */}
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                      <span role="img" aria-label="box" className="text-green-600 text-lg">📦</span>
                                      <span className="font-bold text-lg text-gray-900">{order.products?.name}</span>
                                    </div>
                                    <span className="font-bold" style={{ color: "#11B122", fontSize: 16 }}>
                                      {order.total_amount ? order.total_amount.toLocaleString() + " FCFA" : "Ex : 50 000"}
                                    </span>
                                  </div>
                                  <div className="flex items-center mb-1">
                                    <span className="text-xs font-semibold text-gray-700" style={{background:'#fff',borderRadius:4,padding:'2px 8px',border:'1px solid #e0e0e0',marginRight:8}}>Code commande :</span>
                                    <span className="text-base font-mono font-bold text-orange-600" style={{letterSpacing:'1px',fontSize:'16px', marginLeft: 8}}>{order.order_code || order.id}</span>
                                  </div>
                                  {/* Heure de la commande */}
                                  <div className="flex items-center text-xs text-gray-500 mb-1">
                                    <span>🕐 {new Date(order.created_at || Date.now()).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                  <div className="flex items-center text-sm text-gray-800 mb-1">
                                    <strong>Client :</strong>
                                    <div style={{ marginLeft: 8 }}>
                                      <button
                                        type="button"
                                        onClick={() => handleCallClient(order)}
                                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-[11px] font-medium hover:bg-blue-100 transition min-w-[56px]"
                                        aria-label="Appeler ce client"
                                      >
                                        <PhoneIcon className="h-4 w-4" />
                                        <span className="ml-1 text-[11px] leading-tight">Appeler ce client</span>
                                      </button>
                                    </div>
                                  </div>
                                  <div className="flex items-center text-sm text-gray-800 mb-1">
                                    <strong>Adresse :</strong>
                                    <span className="text-gray-700" style={{ marginLeft: 8 }}>{order.delivery_address || (order as any).buyer?.address || (order as any).buyer_address || 'Adresse à définir'}</span>
                                  </div>
                                  {/* Statut tout en bas */}
                                  <div className="flex items-center mb-1 mt-2">
                                    <span className="text-sm font-semibold text-gray-800">Statut commande :</span>
                                    <span className="text-xs font-bold text-white" style={{background:'#2563eb',borderRadius:12,padding:'2px 5px',fontSize:'11px',letterSpacing:'1px',textTransform:'capitalize',boxShadow:'0 1px 4px #2563eb22', marginLeft: 8}}>
                                      {order.status && STATUS_LABELS_FR[order.status as keyof typeof STATUS_LABELS_FR] || order.status}
                                    </span>
                                  </div>
                                  {/* Invoice buttons: order invoice (buyer-facing) and payout batch invoices (vendor-facing) */}
                                  <div className="flex items-center mt-2 space-x-2">
                                    {/* Order invoice (public endpoint) - open in modal */}
                                    <Button
                                      size="sm"
                                      onClick={() => openInvoiceInModal(`/api/orders/${order.id}/invoice`, `Facture commande ${order.order_code || order.id}`, false)}
                                      className="bg-gray-100 text-gray-800"
                                    >
                                      Voir facture
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                
                {orders.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <ShoppingCart className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm">Vos commandes seront affichées ici.</p>
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="analytics" className="mt-0">
              {/* ...onglet Statistiques supprimé... */}
            </TabsContent>
            <TabsContent value="profile" className="mt-0">
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Mon Compte</h2>
                <Card>
                  <CardContent className="p-4">
                    {!isEditingProfile ? (
                      <div className="space-y-3">
                        <div>
                          <label className="text-sm font-medium text-gray-500">Nom complet</label>
                          <p className="text-lg">{userProfile?.full_name || 'Non défini'}</p>
                        </div>

                        <div>
                          <label className="text-sm font-medium text-gray-500">Téléphone</label>
                          <p className="text-lg">{userProfile?.phone || 'Non défini'}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Compte de paiement</label>
                          <p className="text-lg">
                            {userProfile?.wallet_type === 'wave-senegal' ? 'Wave' : userProfile?.wallet_type === 'orange-money' ? 'Orange Money' : 'Non défini'}
                          </p>
                        </div>
                        <Button
                          onClick={() => setIsEditingProfile(true)}
                          className="w-full bg-green-500 hover:bg-green-600"
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Modifier le profil
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleSignOut}
                          disabled={signingOut}
                          className="w-full mt-2 flex items-center justify-center"
                        >
                          <LogOut className="h-4 w-4 mr-2" />
                          {signingOut ? 'Déconnexion...' : 'Déconnexion'}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium">Nom complet</label>
                          <Input
                            name="full_name"
                            value={editProfile.full_name}
                            onChange={handleProfileChange}
                            placeholder="Votre nom complet"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Téléphone</label>
                          <Input
                            name="phone"
                            value={editProfile.phone}
                            onChange={handleProfileChange}
                            placeholder="Numéro de téléphone"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Wallet utilisé</label>
                          <select
                            name="wallet_type"
                            value={editProfile.wallet_type}
                            onChange={e => setEditProfile(p => ({ ...p, wallet_type: e.target.value }))}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 mt-1"
                            title="Type de wallet pour recevoir les paiements"
                          >
                            <option value="">Choisir un wallet...</option>
                            <option value="wave-senegal">Wave</option>
                            <option value="orange-money">Orange Money</option>
                          </select>
                        </div>
                        <div className="flex space-x-2">
                          <Button
                            onClick={handleSaveProfile}
                            disabled={savingProfile}
                            className="flex-1 bg-green-500 hover:bg-green-600"
                          >
                            {savingProfile ? 'Enregistrement...' : 'Enregistrer'}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setIsEditingProfile(false)}
                            className="flex-1"
                          >
                            Annuler
                          </Button>
                        </div>
                        <Button
                          variant="outline"
                          onClick={signOut}
                          className="w-full mt-2 flex items-center justify-center"
                        >
                          <LogOut className="h-4 w-4 mr-2" />
                          Déconnexion
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </div>
          {/* Bottom Navigation Bar - Fixed */}
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 shadow-lg">
            <TabsList className="w-full h-16 bg-white rounded-none border-0">
              <div className="flex w-full h-16 bg-white justify-around items-center px-2">
                <TabsTrigger
                  value="products"
                  className="flex flex-col items-center justify-center space-y-1 h-14 w-20 data-[state=active]:bg-green-50 data-[state=active]:text-green-600 rounded-xl transition-all"
                >
                  <Package className="h-5 w-5" />
                  <span className="text-xs font-medium">Produits</span>
                </TabsTrigger>
                <TabsTrigger
                  value="orders"
                  className="flex flex-col items-center justify-center space-y-1 h-14 w-20 data-[state=active]:bg-green-50 data-[state=active]:text-green-600 rounded-xl transition-all"
                >
                  <ShoppingCart className="h-5 w-5" />
                  <span className="text-xs font-medium">Commandes</span>
                </TabsTrigger>
                <TabsTrigger
                  value="profile"
                  className="flex flex-col items-center justify-center space-y-1 h-14 w-20 data-[state=active]:bg-green-50 data-[state=active]:text-green-600 rounded-xl transition-all"
                >
                  <User className="h-5 w-5" />
                  <span className="text-xs font-medium">Compte</span>
                </TabsTrigger>
              </div>
            </TabsList>
          </div>
        </Tabs>
      </div>
      </main>
      {/* Invoice Viewer Modal (in-app) */}
      <Dialog open={invoiceViewerOpen} onOpenChange={setInvoiceViewerOpen}>
        <DialogContent className={`max-w-4xl ${typeof window !== 'undefined' && window.innerWidth <= 640 ? 'max-w-full w-full h-screen p-0' : ''}`}>
          {/* Mobile layout: make modal fullscreen with stacked header + iframe */}
          <div className={`${typeof window !== 'undefined' && window.innerWidth <= 640 ? 'h-full flex flex-col' : ''}`}>
            <div className={`${typeof window !== 'undefined' && window.innerWidth <= 640 ? 'flex items-center justify-between p-4 border-b' : ''}`}>
              <DialogHeader className={`${typeof window !== 'undefined' && window.innerWidth <= 640 ? 'p-0 m-0' : ''}`}>
                <DialogTitle className={`${typeof window !== 'undefined' && window.innerWidth <= 640 ? 'text-lg' : ''}`}>{invoiceViewerTitle}</DialogTitle>
              </DialogHeader>
              {typeof window !== 'undefined' && window.innerWidth <= 640 && (
                <div className="flex gap-2 ml-2">
                  <Button size="sm" onClick={downloadVisibleInvoice} className="bg-green-500 hover:bg-green-600 text-white">Télécharger</Button>
                  <Button size="sm" variant="ghost" onClick={() => setInvoiceViewerOpen(false)}>Fermer</Button>
                </div>
              )}
            </div>

            <div className={`${typeof window !== 'undefined' && window.innerWidth <= 640 ? 'flex-1 overflow-auto p-3' : 'py-2'}`}>
              {invoiceViewerLoading && <div className="flex justify-center py-8"><Spinner /></div>}
              {!invoiceViewerLoading && invoiceViewerHtml && (
                <div>
                  {/* Desktop: buttons above iframe; Mobile: buttons are in header */}
                  {!(typeof window !== 'undefined' && window.innerWidth <= 640) && (
                    <div className="flex justify-end gap-2 mb-2">
                      <Button size="sm" onClick={downloadVisibleInvoice} className="bg-green-500 hover:bg-green-600 text-white">Télécharger</Button>
                      <Button size="sm" variant="ghost" onClick={() => setInvoiceViewerOpen(false)}>Fermer</Button>
                    </div>
                  )}

                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                    <iframe
                      title="invoice-preview"
                      srcDoc={invoiceViewerHtml}
                      style={{ width: '100%', height: (typeof window !== 'undefined' && window.innerWidth <= 640) ? 'calc(100vh - 140px)' : '70vh', border: 0 }}
                    />
                  </div>
                </div>
              )}
              {!invoiceViewerLoading && !invoiceViewerHtml && (
                <div className="text-center py-8 text-gray-500">Aucune facture à afficher</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Vendor payout batches modal (list & open) */}
      <Dialog open={batchesModalOpen} onOpenChange={setBatchesModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Factures de paiement</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {batchesLoading && <div className="flex justify-center py-6"><Spinner /></div>}
            {!batchesLoading && vendorBatches && vendorBatches.length === 0 && (
              <div className="text-center py-6 text-gray-500">Aucune facture de batch disponible</div>
            )}
            {!batchesLoading && vendorBatches && vendorBatches.length > 0 && (
              <div className="space-y-3">
                {vendorBatches.map(b => (
                  <div key={b.id} className="flex items-center justify-between border p-2 rounded">
                    <div className="text-sm">
                      <div className="font-medium">Batch {String(b.id).slice(0,8)}</div>
                      <div className="text-xs text-gray-500">{b.created_at ? new Date(b.created_at).toLocaleString() : ''}</div>
                      <div className="text-xs text-gray-700">Montant net: {b.total_net?.toLocaleString?.() || 0} FCFA</div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => { setBatchesModalOpen(false); openInvoiceInModal(`/api/vendor/payout-batches/${b.id}/invoice`, `Facture batch ${String(b.id).slice(0,8)}`, true); }} className="bg-gray-100 text-gray-800">Voir</Button>
                      <Button size="sm" onClick={() => handleDownloadInvoice(`/api/vendor/payout-batches/${b.id}/invoice`)} className="bg-green-500 text-white">Télécharger</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={() => setBatchesModalOpen(false)}>Fermer</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Product Modal */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter un nouveau produit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nom du produit</label>
              <Input
                value={newProduct.name}
                onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                placeholder="Ex: iPhone 13"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Prix (CFA)</label>
              <Input
                type="number"
                value={newProduct.price}
                onChange={(e) => setNewProduct({...newProduct, price: e.target.value})}
                placeholder="Ex: 500000"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={newProduct.description}
                onChange={(e) => setNewProduct({...newProduct, description: e.target.value})}
                placeholder="Décrivez votre produit..."
                rows={3}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Garantie (optionnel)</label>
              <Input
                value={newProduct.warranty}
                onChange={(e) => setNewProduct({...newProduct, warranty: e.target.value})}
                placeholder="Ex: 12 mois"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleAddProduct}
              disabled={adding}
              className="bg-green-500 hover:bg-green-600"
            >
              {adding ? 'Ajout...' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Edit Product Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier le produit</DialogTitle>
          </DialogHeader>
          {editProduct && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nom du produit</label>
                <Input
                  value={editProduct.name || ''}
                  onChange={(e) => setEditProduct({...editProduct, name: e.target.value})}
                  placeholder="Ex: iPhone 13"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Prix (CFA)</label>
                <Input
                  type="number"
                  value={editProduct.price || 0}
                  onChange={(e) => setEditProduct({...editProduct, price: parseInt(e.target.value) || 0})}
                  placeholder="Ex: 500000"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={editProduct.description || ''}
                  onChange={(e) => setEditProduct({...editProduct, description: e.target.value})}
                  placeholder="Décrivez votre produit..."
                  rows={3}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Garantie (optionnel)</label>
                <Input
                  value={editProduct.warranty || ''}
                  onChange={(e) => setEditProduct({...editProduct, warranty: e.target.value})}
                  placeholder="Ex: 12 mois"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleEditProduct}
              disabled={editing}
              className="bg-green-500 hover:bg-green-600"
            >
              {editing ? 'Modification...' : 'Modifier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <p className="text-gray-600">
            Êtes-vous sûr de vouloir supprimer ce produit ? Cette action est irréversible.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteProduct}
              disabled={deleting}
            >
              {deleting ? 'Suppression...' : 'Supprimer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Call Confirmation Dialog */}
      <Dialog open={callModalOpen} onOpenChange={setCallModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Appeler ce client ?</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">{callTarget ? `${callTarget.name || 'Client'} - ${callTarget.phone}` : 'Numéro inconnu'}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCallModalOpen(false)}>
              Annuler
            </Button>
            <Button className="bg-green-600 text-white" onClick={() => { if (callTarget) { window.location.href = `tel:${callTarget.phone}`; setCallModalOpen(false); } }}>
              Appeler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default VendorDashboard;