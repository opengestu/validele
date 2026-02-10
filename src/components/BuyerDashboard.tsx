/* eslint-disable @typescript-eslint/no-unused-expressions */
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, ShoppingCart, Package, Clock, CheckCircle, QrCode, UserCircle, CreditCard, Minus, Plus, Settings, XCircle, AlertTriangle } from 'lucide-react';
import { PhoneIcon, WhatsAppIcon } from './CustomIcons';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { PaymentForm } from '@/components/PaymentForm';
import { PayDunyaService } from '@/services/paydunya';
import { PixPayService } from '@/services/pixpay';
import { PaymentWebView } from '@/components/PaymentWebView';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Product, Order } from '@/types/database';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { API_BASE, apiUrl, postProfileUpdate, getProfileById, safeJson } from '@/lib/api';
import { toFrenchErrorMessage } from '@/lib/errors';
import { Spinner } from '@/components/ui/spinner';
import useNetwork from '@/hooks/useNetwork';
import.meta.env;

// Temporary placeholders for payment logos — replace with real imports if available
const waveLogo = '/images/wave.png';
const orangeMoneyLogo = '/images/orange_money.png';


// Fonction utilitaire pour fetch avec timeout (générique TypeScript)
async function fetchJsonWithTimeout<T = unknown>(url: string, init: RequestInit, timeoutMs: number): Promise<{ res: Response; data: T }> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const parsed = await safeJson(res);
    if (parsed && typeof parsed === 'object' && '__parseError' in parsed) {
      const err = new Error('Réponse invalide du serveur (JSON attendu).') as Error & { status?: number; body?: unknown };
      err.status = res.status;
      // parsed comes from safeJson and may not strictly match the expected shape; cast via unknown then access __raw safely
      err.body = { raw: (parsed as unknown as { __raw?: string }).__raw || '' };
      throw err;
    }
    const data = ((parsed ?? {}) as unknown) as T;
    return { res, data };
  } finally {
    clearTimeout(timeoutId);
  }
}

type PaymentMethod = 'wave' | 'orange_money';

// Interfaces pour les réponses API
interface PayDunyaResponse {
  status?: string;
  token?: string;
  message?: string;
  receipt_url?: string;
  order_id?: string;
  qr_code?: string;
}

interface SoftPayResponse {
  success?: boolean;
  url?: string;
  message?: string;
}

interface CreateOrderResponse {
  success: boolean;
  id?: string;
  order_id?: string;
  order_code?: string;
  qr_code?: string;
  message?: string;
}

// Typed navigator helpers for Web Share API (files support may not exist in all TS libs)
interface NavigatorShareWithFiles {
  canShare?: (data: { files?: File[] }) => boolean;
  share?: (data: ShareData & { files?: File[] }) => Promise<void>;
}

const BuyerDashboard = () => {
  const { toast } = useToast();
  const { user, signOut, userProfile: authUserProfile, loading } = useAuth();
  const navigate = useNavigate();

  // Sécurité: si l'utilisateur n'est pas connecté ou profil incomplet, rediriger immédiatement
  useEffect(() => {
    if (!loading && (!user || !authUserProfile || !authUserProfile.full_name)) {
      navigate('/auth', { replace: true });
    }
  }, [user, authUserProfile, loading, navigate]);

  // Afficher un spinner pendant le chargement initial de l'authentification
  if (loading) {
    return (
      <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-white">
        <Spinner size="xl" className="text-black" />
        <p className="text-lg font-medium text-gray-700 mt-4">Chargement...</p>
      </div>
    );
  }

  // ...existing code...
  // ...existing code...
  const [searchCode, setSearchCode] = useState('');
  const [searchResult, setSearchResult] = useState<Product | null>(null);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<Array<{id: string; order_id: string; status: string; amount?: number; transaction_type?: string; created_at: string}>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const isOnline = useNetwork();
  // Polling guard to avoid overlapping fetches during periodic polling
  const pollingRef = React.useRef({ orders: false, transactions: false });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wave');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  // Profile state for user information
  const [userProfile, setUserProfile] = useState<{ full_name?: string; phone?: string; address?: string } | null>(null);
  const [editProfile, setEditProfile] = useState<{ full_name: string; phone: string }>({ full_name: '', phone: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrModalValue, setQrModalValue] = useState('');
  const [selectedQrCode, setSelectedQrCode] = useState<string | null>(null);
  const [purchaseQuantity, setPurchaseQuantity] = useState(1);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [payDunyaService] = useState(new PayDunyaService());
  const [pixPayService] = useState(new PixPayService());
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  // Ajout d'un état pour afficher le formulaire de paiement direct
  const [showDirectPaymentForm, setShowDirectPaymentForm] = useState(false);
  const [pendingOrderToken, setPendingOrderToken] = useState<string | null>(null);
  // Ajout d'un état pour stocker l'URL du reçu PDF
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  // Ajout d'un état pour stocker l'order_id
  const [orderId, setOrderId] = useState<string | null>(null);

  // Invoice viewer modal states (buyer)
  const [invoiceViewerOpen, setInvoiceViewerOpen] = useState(false);
  const [invoiceViewerHtml, setInvoiceViewerHtml] = useState<string | null>(null);
  const [invoiceViewerTitle, setInvoiceViewerTitle] = useState<string>('Facture');
  const [invoiceViewerLoading, setInvoiceViewerLoading] = useState(false);
  const [invoiceViewerFilename, setInvoiceViewerFilename] = useState<string | null>(null);

  async function openInvoiceInModal(url: string, title = 'Facture', requiresAuth = false) {
    try {
      setInvoiceViewerLoading(true);
      setInvoiceViewerTitle(title);
      setInvoiceViewerHtml(null);
      setInvoiceViewerFilename(null);

      // Try SMS session token first
      const smsSessionStr = typeof window !== 'undefined' ? localStorage.getItem('sms_auth_session') : null;
      let token = smsSessionStr ? (JSON.parse(smsSessionStr || '{}')?.access_token || JSON.parse(smsSessionStr || '{}')?.token || '') : '';

      if (requiresAuth && !token) {
        try {
          const s = await supabase.auth.getSession();
          token = s?.data?.session?.access_token || '';
        } catch (e) { token = ''; }
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
      const m = /filename\s*=\s*"?([^;"]+)"?/i.exec(cd);
      const filename = (m && m[1]) ? m[1] : (title.replace(/\s+/g,'-').toLowerCase() + '.html');
      const text = await resp.text();

      setInvoiceViewerFilename(filename);
      setInvoiceViewerHtml(text);
      setInvoiceViewerOpen(true);
    } catch (err) {
      console.error('[BuyerDashboard] openInvoiceInModal error', err);
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
      console.error('[BuyerDashboard] downloadVisibleInvoice error', err);
      toast({ title: 'Erreur', description: 'Impossible de télécharger la facture', variant: 'destructive' });
    }
  }

  // Ajout d'un état pour afficher le modal SoftPay
  const [showSoftPayModal, setShowSoftPayModal] = useState(false);
  const [softPayType, setSoftPayType] = useState<'wave' | 'orange_qr' | 'orange_otp' | null>(null);
  const [softPayLoading, setSoftPayLoading] = useState(false);
  const [softPayError, setSoftPayError] = useState<string | null>(null);
  const [softPayQrUrl, setSoftPayQrUrl] = useState<string | null>(null);
  const [softPayRedirectUrl, setSoftPayRedirectUrl] = useState<string | null>(null);
  // Ajout d'un état pour OTP Orange Money uniquement
  const [showOtpForm, setShowOtpForm] = useState(false);
  const [pendingOtpInfo, setPendingOtpInfo] = useState<{ fullName: string; email: string; phone: string; token: string } | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  // 1. Ajouter un nouvel état pour le modal de choix Orange Money
  const [showOrangeChoiceModal, setShowOrangeChoiceModal] = useState(false);
  const [onOrangeChoice, setOnOrangeChoice] = useState<((choice: 'qr' | 'otp') => void) | null>(null);
  
  // États pour le remboursement
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundLoading, setRefundLoading] = useState(false);

  // États pour la WebView de paiement
  const [showPaymentWebView, setShowPaymentWebView] = useState(false);
  const [paymentWebViewUrl, setPaymentWebViewUrl] = useState('');

  // Fonction pour charger les commandes de l'acheteur (doit être dans le composant pour accéder à user, setOrders...)
  const fetchOrders = useCallback(async (opts?: { silent?: boolean }) => {
    const smsSessionStr = typeof window !== 'undefined' ? localStorage.getItem('sms_auth_session') : null;
    if (!user && !smsSessionStr) return;
    if (!opts?.silent) setOrdersLoading(true);
    try {
      const buyerId = user?.id || (smsSessionStr ? (JSON.parse(smsSessionStr || '{}')?.profileId || null) : null);
      if (!buyerId) {
        if (!opts?.silent) setOrdersLoading(false);
        return;
      }
      let data: Array<Record<string, unknown>> = [];
      // Use server endpoint for both SMS and Supabase sessions to avoid RLS issues.
      const sms = smsSessionStr ? JSON.parse(smsSessionStr || '{}') : null;
      let token = sms?.access_token || sms?.token || sms?.jwt || '';
      if (!token) {
        // Try to get Supabase session access token
        try {
          const sessRes = await supabase.auth.getSession();
          const sess = sessRes.data?.session ?? null;
          token = sess?.access_token || '';
        } catch (e) {
          // ignore
          token = '';
        }
      }

      // Call server endpoint; fallback to query param buyer_id if no token
      const url = apiUrl(`/api/buyer/orders?buyer_id=${buyerId}`);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const resp = await fetch(url, { method: 'GET', headers });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || !json.success) {
        throw new Error((json && json.error) ? String(json.error) : `Backend returned ${resp.status}`);
      }

      data = json.orders || [];

      // Normalisation: backend retourne `vendor` et `delivery` (ou vendor/delivery), adapter au format attendu côté UI
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data = (data || []).map((o: any) => ({
        ...o,
        // Adapter les clés venant du backend à celles attendues par l'UI
        profiles: o.profiles || o.vendor || null,
        delivery_person: o.delivery_person || o.delivery || null,
        products: o.products || o.product || null,
        // qr_code peut venir sous différentes formes (qr_code / token)
        qr_code: o.qr_code || o.token || null,
      }));
      const allowedStatus = ['paid', 'in_delivery', 'delivered', 'refunded', 'cancelled'];
      let normalizedOrders = (data || [])
        .filter((o) => typeof o.status === 'string' && allowedStatus.includes(o.status))
        .map((o) => ({
          ...o,
          delivery_person_id: o.delivery_person_id ?? undefined,
          assigned_at: o.assigned_at ?? undefined,
          delivered_at: o.delivered_at ?? undefined,
        })) as Order[];

      // If some orders are missing vendor/delivery profiles, try to fetch them via backend profile endpoint (batch)
      try {
        const missingVendorIds = Array.from(new Set(normalizedOrders.filter(o => !o.profiles && o.vendor_id).map(o => String(o.vendor_id))));
        const missingDeliveryIds = Array.from(new Set(normalizedOrders.filter(o => !o.delivery_person && o.delivery_person_id).map(o => String(o.delivery_person_id))));

        // Helper to fetch and return profile map
        const fetchProfilesMap = async (ids: string[]) => {
          type ProfileLike = { id?: string; company_name?: string; phone?: string; address?: string; [key: string]: unknown };
          const map: Record<string, ProfileLike> = {};
          await Promise.all(ids.map(async (id) => {
            try {
              const { ok, json } = await getProfileById(id);
              if (ok && json) {
                const profile = (json.profile ?? json) as ProfileLike;
                if (profile && profile.id) map[id] = profile;
              }
            } catch (e) {
              console.warn('[BUYER] failed to fetch profile for id', id, e);
            }
          }));
          return map;
        };

        const vendorMap = missingVendorIds.length > 0 ? await fetchProfilesMap(missingVendorIds) : {};
        const deliveryMap = missingDeliveryIds.length > 0 ? await fetchProfilesMap(missingDeliveryIds) : {};

        // Merge profiles into orders
        normalizedOrders = normalizedOrders.map(o => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const copy = { ...o } as any;
          if (!copy.profiles && copy.vendor_id && vendorMap[String(copy.vendor_id)]) {
            copy.profiles = vendorMap[String(copy.vendor_id)];
          }
          if (!copy.delivery_person && copy.delivery_person_id && deliveryMap[String(copy.delivery_person_id)]) {
            copy.delivery_person = deliveryMap[String(copy.delivery_person_id)];
          }
          return copy as Order;
        });
      } catch (fetchProfileErr) {
        console.warn('[BUYER] profile enrichment failed:', fetchProfileErr);
      }

      // Cache les dernières commandes connues pour éviter le "flash" si le backend
      // renvoie temporairement une liste vide (problèmes de session / propagation).
      const cacheKey = `cached_buyer_orders_${buyerId}`;
      try {
        if (normalizedOrders.length > 0) {
          localStorage.setItem(cacheKey, JSON.stringify({ orders: normalizedOrders, ts: Date.now() }));
          setOrders(normalizedOrders);
        } else {
          // Si la réponse est vide, tenter d'utiliser le cache récent (<5min)
          const raw = localStorage.getItem(cacheKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.orders && (Date.now() - (parsed.ts || 0) < 5 * 60 * 1000)) {
              console.warn('[BUYER] backend returned empty orders — using cached orders to avoid flicker');
              setOrders(parsed.orders as Order[]);
              // Schedule a quick retry to get fresh data
              setTimeout(() => { fetchOrders(); }, 2000);
            } else {
              // Cache stale or absent — clear orders
              setOrders([]);
            }
          } else {
            setOrders([]);
          }
        }
      } catch (e) {
        console.warn('[BUYER] cache error:', e);
        setOrders(normalizedOrders);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des commandes:', error);
      // Suppressed user-facing destructive toast; use cached data / silent fallback instead
      console.debug('[BUYER] fetchOrders failed, handled silently');
    } finally {
      if (!opts?.silent) setOrdersLoading(false);
    }
  }, [user, toast]);


  const fetchTransactions = useCallback(async () => {
    const smsSessionStr = typeof window !== 'undefined' ? localStorage.getItem('sms_auth_session') : null;
    if (!user && !smsSessionStr) return;

    try {
      // Use server endpoint to fetch transactions (handles auth and RLS safely)
      const buyerId = user?.id || (smsSessionStr ? (JSON.parse(smsSessionStr || '{}')?.profileId || null) : null);
      if (!buyerId) return;

      // Determine token (SMS session or Supabase session)
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

      const url = apiUrl(`/api/buyer/transactions?buyer_id=${buyerId}`);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const resp = await fetch(url, { method: 'GET', headers });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || !json.success) {
        throw new Error((json && json.error) ? String(json.error) : `Backend returned ${resp.status}`);
      }

      const txs = (json.transactions || []) as Array<{id: string; order_id: string; status: string; amount?: number; transaction_type?: string; created_at: string}>;
      setTransactions(txs);
      try { localStorage.setItem(`cached_buyer_transactions_${buyerId}`, JSON.stringify(txs)); } catch(e) { /* ignore */ }
    } catch (error) {
      console.error('Erreur lors du chargement des transactions:', error);
      try {
        const cached = localStorage.getItem(`cached_buyer_transactions_${user?.id}`);
        if (cached) {
          setTransactions(JSON.parse(cached));
          // Use cached transactions silently (no toast)
          console.info('[BuyerDashboard] using cached transactions silently');
          return;
        }
      } catch (e) {
        // ignore
      }
    }
  }, [user, toast]);

  useEffect(() => {
    // Wait for auth initialization to complete before fetching orders/txs.
    // This avoids empty results when the session is still being restored.
    if (loading) return;
    fetchOrders();
    fetchTransactions();
  }, [fetchOrders, fetchTransactions, loading]);

  // Offline banner is rendered within the layout UI below


  // Listener pour rafraîchir les commandes quand l'utilisateur revient du navigateur de paiement
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const setupBrowserListener = async () => {
      const listener = await Browser.addListener('browserFinished', () => {
        
        // Rafraîchir les commandes après 1 seconde
        setTimeout(() => {
          fetchOrders();
          fetchTransactions();
        }, 1000);
      });

      return () => {
        listener.remove();
      };
    };

    setupBrowserListener();
  }, [fetchOrders, fetchTransactions]);

  // Warm up the backend (Render cold start) - faire plusieurs tentatives pour réveiller le serveur
  const [backendReady, setBackendReady] = useState(false);
  useEffect(() => {
    if (!API_BASE) return;
    
    const warmUpBackend = async () => {
      // Essayer de réveiller le backend au chargement
      for (let i = 0; i < 3; i++) {
        try {
          const response = await fetch(apiUrl('/health'), { 
            method: 'GET',
            signal: AbortSignal.timeout(15000) // 15s max par tentative
          });
          if (response.ok) {
            setBackendReady(true);
            return;
          }
        } catch {
          // Continuer à essayer
        }
        // Attendre 2s avant de réessayer
        if (i < 2) await new Promise(r => setTimeout(r, 2000));
      }
    };
    
    warmUpBackend();
  }, []);

  // Synchronize user profile from Supabase
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) {
        setUserProfile(null);
        setEditProfile({ full_name: '', phone: '' });
        return;
      }

      // If we are in SMS auth mode, use the cached profile from useAuth and avoid calling Supabase (no auth token)
      const smsSessionStr = typeof window !== 'undefined' ? localStorage.getItem('sms_auth_session') : null;
      if (smsSessionStr) {
        
        if (authUserProfile) {
          setUserProfile({ full_name: authUserProfile.full_name ?? undefined, phone: authUserProfile.phone ?? undefined, address: (authUserProfile as any)?.address ?? undefined });
          setEditProfile({ full_name: authUserProfile.full_name ?? '', phone: authUserProfile.phone ?? '' });
        } else {
          setUserProfile(null);
          setEditProfile({ full_name: '', phone: '' });
        }
        return;
      }

      try {
        // Debug: show supabase session and user info before DB ops
        try {
          const sessRes = await supabase.auth.getSession();
          const sess = sessRes.data?.session ?? null;
          
        } catch (e) {
          console.warn('BuyerDashboard supabase.getSession failed', e);
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, phone, address')
          .eq('id', user.id)
          .single();

        if (!error && data) {
          setUserProfile({ 
            full_name: data.full_name ?? undefined, 
            phone: data.phone ?? undefined,
            address: data.address ?? undefined
          });
          // Do not setEditProfile here, only set from userProfile when opening drawer
        } else {
          console.error('BuyerDashboard fetchProfile error', error);
          // Si le profil n'existe pas, le créer automatiquement
          const { error: insertError } = await supabase
            .from('profiles')
            .insert({
              id: user.id,
              full_name: '',
              phone: '',
              role: 'buyer',
            });
          if (!insertError) {
            setUserProfile({ full_name: '', phone: '', address: '' });
          } else {
            setUserProfile(null);
          }
          setEditProfile({ full_name: '', phone: '' });
        }
      } catch (err) {
        console.error('BuyerDashboard unexpected error fetching profile', err);
        setUserProfile(null);
        setEditProfile({ full_name: '', phone: '' });
      }
    };
    fetchProfile();
  }, [user, authUserProfile]);

  // Sync editProfile with userProfile when opening the drawer
  useEffect(() => {
    if (drawerOpen && userProfile) {
      setEditProfile({
        full_name: userProfile.full_name || '',
        phone: userProfile.phone || ''
      });
    }
    if (!drawerOpen) {
      setIsEditing(false);
    }
  }, [drawerOpen, userProfile]);
  // Handler pour sauvegarder le profil
  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const smsSessionStr = typeof window !== 'undefined' ? localStorage.getItem('sms_auth_session') : null;
      if (smsSessionStr) {
        // For SMS-authenticated users, try backend admin endpoints (with fallbacks)
        
        const { ok, json, error, url } = await postProfileUpdate({ profileId: user.id, full_name: editProfile.full_name, phone: editProfile.phone });
        
        if (!ok) throw new Error(`Backend update failed: ${JSON.stringify(error)}`);
        const saved = json?.profile ?? json;
        setUserProfile({ full_name: saved?.full_name ?? editProfile.full_name, phone: saved?.phone ?? editProfile.phone });
        // update local cache
        try {
          const cachedRaw = localStorage.getItem('auth_cached_profile_v1');
          const cacheObj = cachedRaw ? JSON.parse(cachedRaw) : { id: user.id, email: user.email || '', full_name: editProfile.full_name, phone: editProfile.phone, role: 'buyer' };
          cacheObj.full_name = saved?.full_name ?? editProfile.full_name;
          cacheObj.phone = saved?.phone ?? editProfile.phone;
          localStorage.setItem('auth_cached_profile_v1', JSON.stringify(cacheObj));
        } catch (e) {
          // ignore
        }
      } else {
        const { error } = await supabase
          .from('profiles')
          .update({
            full_name: editProfile.full_name,
            phone: editProfile.phone
          })
          .eq('id', user.id);
        if (error) throw error;
        // Relire le profil depuis Supabase après la sauvegarde
        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select('full_name, phone, address')
          .eq('id', user.id)
          .single();
        if (!fetchError && data) {
          setUserProfile({
            full_name: data.full_name ?? undefined,
            phone: data.phone ?? undefined,
            address: data.address ?? undefined
          });
        }
      }

      setDrawerOpen(false);
      toast({ title: 'Profil mis à jour', description: 'Vos informations ont été enregistrées.' });
    } catch (error) {
      console.error('BuyerDashboard handleSaveProfile error', error);
      toast({ title: 'Erreur', description: 'Impossible de sauvegarder le profil', variant: 'destructive' });
    } finally {
      setSavingProfile(false);
    }
  };

  // (Synchronisation déjà gérée ci-dessus)

  useEffect(() => {
    // Subscribe to orders for this buyer to get realtime status updates (orders only) + silent polling
    const buyerId = user?.id || (() => { try { const smsRaw = localStorage.getItem('sms_auth_session'); return smsRaw ? (JSON.parse(smsRaw || '{}')?.profileId || null) : null; } catch (e) { return null; } })();
    if (!buyerId) return;

    const channelName = `buyer-orders-${buyerId}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `buyer_id=eq.${buyerId}` }, payload => {
        console.log('[BuyerDashboard] Realtime order event', payload);
        try { fetchOrders({ silent: true }); } catch (e) { console.warn('[BuyerDashboard] fetchOrders silent failed', e); }
      })
      .subscribe();

    let mounted = true;
    // Polling: orders every 1s (silent), transactions every 5s
    const ordersInterval = setInterval(() => {
      if (!mounted) return;
      if (pollingRef.current.orders) return;
      pollingRef.current.orders = true;
      Promise.resolve(fetchOrders({ silent: true }))
        .catch(e => console.warn('[BuyerDashboard] periodic fetchOrders failed', e))
        .finally(() => { pollingRef.current.orders = false; });
    }, 1000);

    const txInterval = setInterval(() => {
      if (!mounted) return;
      if (pollingRef.current.transactions) return;
      pollingRef.current.transactions = true;
      Promise.resolve(fetchTransactions())
        .catch(e => console.warn('[BuyerDashboard] periodic fetchTransactions failed', e))
        .finally(() => { pollingRef.current.transactions = false; });
    }, 5000);

    return () => {
      mounted = false;
      clearInterval(ordersInterval);
      clearInterval(txInterval);
      try { supabase.removeChannel(channel); } catch (e) { console.warn('[BuyerDashboard] removeChannel failed', e); }
    };
  }, [fetchOrders, fetchTransactions, user]);

  const handleSearch = async () => {
    if (!searchCode.trim()) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer un code produit",
        variant: "destructive",
      });
      return;
    }

    setSearchLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          profiles(full_name, company_name)
        `)
        .ilike('code', searchCode.trim())
        .eq('is_available', true)
        .single();

      if (error) throw error;

      // Normaliser null → undefined pour correspondre au type Product
      const normalizedProduct: Product = {
        ...data,
        description: data.description ?? undefined,
        category: data.category ?? undefined,
        image_url: data.image_url ?? undefined,
        is_available: data.is_available ?? true,
        stock_quantity: data.stock_quantity ?? undefined,
        profiles: data.profiles ? {
          company_name: data.profiles.company_name ?? '',
          full_name: data.profiles.full_name ?? undefined,
        } : undefined,
      };
      setSearchResult(normalizedProduct);
      setSearchModalOpen(true);
      toast({
        title: "Produit trouvé",
        description: `${normalizedProduct.name} - ${normalizedProduct.price.toLocaleString()} FCFA`,
      });
    } catch (error) {
      setSearchResult(null);
      setSearchModalOpen(false);
      toast({
        title: "Produit non trouvé",
        description: "Aucun produit trouvé avec ce code",
        variant: "destructive",
      });
    } finally {
      setSearchLoading(false);
    }
  };

  // Les codes de commande sont maintenant générés côté serveur pour garantir l'unicité et l'atomicité.
  // La génération côté client a été supprimée pour éviter les collisions et les conditions de concurrence.

  // Polling du statut de la commande après paiement
  const pollOrderStatus = (orderId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // 60 x 2s = 2 minutes
    const interval = setInterval(async () => {
      attempts++;
      const { data: order, error } = await supabase
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();
      
      if (order?.status === 'paid') {
        clearInterval(interval);
        toast({
          title: '✅ Paiement confirmé !',
          description: 'Votre commande a été payée avec succès',
        });
        navigate(`/payment-success?order_id=${orderId}`);
      }
      
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        toast({
          title: '⏱️ Délai dépassé',
          description: 'Vérifiez vos commandes pour voir le statut du paiement',
          variant: 'destructive',
        });
      }
    }, 2000);
  };

  const handlePaymentSuccess = async () => {
    if (!currentOrder) return;
    
    // Mettre à jour le statut de la commande
    const { error } = await supabase
      .from('orders')
      .update({ status: 'paid' })
      .eq('id', currentOrder.id);

    if (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour le statut de la commande",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Succès",
      description: "Paiement effectué avec succès",
    });
    setPaymentModalOpen(false);
    setCurrentOrder(null);
    await fetchOrders();
  };

  const handlePaymentError = () => {
    toast({
      title: "Erreur",
      description: "Une erreur est survenue lors du paiement",
      variant: "destructive",
    });
    setPaymentModalOpen(false);
  };

  // ...profile save handler removed...

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const [showAllOrders, setShowAllOrders] = useState(false);
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());
  const [isRedirecting, setIsRedirecting] = useState(false);
  const paydunyaMode = import.meta.env.VITE_PAYDUNYA_MODE || 'prod';
  const [wavePassword, setWavePassword] = useState('');
  const [omPassword, setOmPassword] = useState('');

  // Fonction pour formater le numéro de téléphone pour Orange Money Sénégal
  const formatPhoneForOrangeMoney = (phone: string): string => {
    if (!phone) return '';
    
    // Nettoyer le numéro (supprimer espaces, tirets, parenthèses)
    const cleanPhone = phone.replace(/[\s\-()]/g, '');
    
    // Si le numéro commence par +221, le garder tel quel
    if (cleanPhone.startsWith('+221')) {
      return cleanPhone;
    }
    
    // Si le numéro commence par 221, ajouter le +
    if (cleanPhone.startsWith('221')) {
      return '+' + cleanPhone;
    }
    
    // Si le numéro commence par 7 ou 3 (numéros sénégalais), ajouter +221
    if (cleanPhone.startsWith('7') || cleanPhone.startsWith('3')) {
      return '+221' + cleanPhone;
    }
    
    // Sinon, assumer que c'est un numéro sénégalais et ajouter +221
    return '+221' + cleanPhone;
  };

  // Nouvelle version de handleCreateOrderAndShowPayment : tout se fait en un clic
  const handleCreateOrderAndShowPayment = async () => {
    if (!searchResult || !user) return;
    
    // Vérifier la connexion internet
    if (!navigator.onLine) {
      toast({
        title: 'Pas de connexion',
        description: 'Vérifiez votre connexion internet et réessayez.',
        variant: 'destructive',
      });
      return;
    }

    // Si c'est Orange Money, utiliser le numéro du profil
    if (paymentMethod === 'orange_money') {
      if (!userProfile?.phone) {
        toast({
          title: 'Numéro manquant',
          description: 'Veuillez ajouter un numéro de téléphone dans votre profil',
          variant: 'destructive',
        });
        return;
      }

      try {
        setProcessingPayment(true);
        
        // Créer la commande d'abord
        const { res: response, data } = await fetchJsonWithTimeout<CreateOrderResponse>(
          apiUrl('/api/orders'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              buyer_id: user.id,
              product_id: searchResult.id,
              vendor_id: searchResult.vendor_id,
              total_amount: searchResult.price * purchaseQuantity,
              payment_method: 'orange_money',
              buyer_phone: userProfile?.phone || '',
              delivery_address: userProfile?.address || authUserProfile?.address || 'Adresse à définir',
            })
          },
          30000
        );

        if (!response.ok) {
          throw new Error(data?.message || 'Erreur création commande');
        }

        const createdOrderId = data?.id || data?.order_id || '';
        if (!createdOrderId) {
          throw new Error('ID de commande non reçu du serveur');
        }

        // Récupérer le code renvoyé par le serveur (ne pas ouvrir automatiquement le modal QR pour les paiements directs)
        setOrderId(data?.id || data?.order_id || createdOrderId);
        if (data?.qr_code) {
          setQrModalValue(data.qr_code);
          // Le modal QR ne doit être affiché que si l'utilisateur le demande ("Voir QR code") ou pour les modes qui l'exigent
        }
        
        // Initier le paiement Orange Money directement
        const orangeResult = await pixPayService.initiatePayment({
          amount: searchResult.price * purchaseQuantity,
          phone: userProfile.phone,
          orderId: createdOrderId,
          customData: {
            description: `Achat ${searchResult.name}`,
            storeName: searchResult.profiles?.company_name || ''
          }
        });

        if (orangeResult.success && orangeResult.sms_link) {
          // Ouvrir directement le lien Orange Money
          await pixPayService.openPaymentLink(orangeResult.sms_link);
          
          toast({
            title: '🔄 Paiement Orange Money en cours',
            description: 'Veuillez compléter le paiement dans la page qui s\'est ouverte. Votre commande sera confirmée automatiquement une fois le paiement effectué.',
            duration: 10000, // 10 secondes
          });
          
          // Démarrer le polling du statut de la commande
          pollOrderStatus(createdOrderId);
          
          // Fermer le modal et retourner à la recherche
          setSearchModalOpen(false);
          setSearchResult(null);
          setPurchaseQuantity(1);
          setPaymentMethod('wave');
          setSearchCode('');
        } else {
          throw new Error(orangeResult.error || orangeResult.message || 'Erreur paiement Orange Money');
        }
        
      } catch (error) {
        const err = error as Error;
        toast({
          title: 'Erreur',
          description: err.message || 'Erreur lors du paiement Orange Money',
          variant: 'destructive',
        });
      } finally {
        setProcessingPayment(false);
      }
      return;
    }

    // Si c'est Wave, utiliser le numéro du profil
    if (paymentMethod === 'wave') {
      if (!userProfile?.phone) {
        toast({
          title: 'Numéro manquant',
          description: 'Veuillez ajouter un numéro de téléphone dans votre profil',
          variant: 'destructive',
        });
        return;
      }

      try {
        setProcessingPayment(true);
        
        // Créer la commande d'abord
        const { res: response, data } = await fetchJsonWithTimeout<CreateOrderResponse>(
          apiUrl('/api/orders'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              buyer_id: user.id,
              product_id: searchResult.id,
              vendor_id: searchResult.vendor_id,
              total_amount: searchResult.price * purchaseQuantity,
              payment_method: 'wave',
              buyer_phone: userProfile?.phone || '',
              delivery_address: userProfile?.address || authUserProfile?.address || 'Adresse à définir',
            })
          },
          30000
        );

        if (!response.ok) {
          throw new Error(data?.message || 'Erreur création commande');
        }

        const createdOrderId = data?.id || data?.order_id || '';
        if (!createdOrderId) {
          throw new Error('ID de commande non reçu du serveur');
        }

        // Récupérer le code renvoyé par le serveur (ne pas ouvrir automatiquement le modal QR pour les paiements directs)
        setOrderId(data?.id || data?.order_id || createdOrderId);
        if (data?.qr_code) {
          setQrModalValue(data.qr_code);
          // Le modal QR ne doit être affiché que si l'utilisateur le demande ("Voir QR code") ou pour les modes qui l'exigent
        }

        // Initier le paiement Wave directement
        console.log('[BuyerDashboard] Initiation paiement Wave avec:', {
          amount: searchResult.price * purchaseQuantity,
          phone: userProfile.phone,
          orderId: createdOrderId
        });
        
        const waveResult = await pixPayService.initiateWavePayment({
          amount: searchResult.price * purchaseQuantity,
          phone: userProfile.phone,
          orderId: createdOrderId,
          customData: {
            description: `Achat ${searchResult.name}`,
            storeName: searchResult.profiles?.company_name || ''
          }
        });

        console.log('[BuyerDashboard] Résultat Wave:', waveResult);
        console.log('[BuyerDashboard] SMS Link:', waveResult.sms_link);

        if (waveResult.success && waveResult.sms_link) {
          // Ouvrir directement le lien Wave
          await pixPayService.openPaymentLink(waveResult.sms_link);
          
          toast({
            title: '🔄 Paiement Wave en cours',
            description: 'Veuillez compléter le paiement dans l\'application Wave qui s\'est ouverte. Votre commande sera confirmée automatiquement une fois le paiement effectué.',
            duration: 10000, // 10 secondes
          });
          
          // Démarrer le polling du statut de la commande
          pollOrderStatus(createdOrderId);
          
          // Fermer le modal et retourner à la recherche
          setSearchModalOpen(false);
          setSearchResult(null);
          setPurchaseQuantity(1);
          setPaymentMethod('wave');
          setSearchCode('');
        } else {
          throw new Error(waveResult.error || waveResult.message || 'Erreur paiement Wave');
        }
        
      } catch (error) {
        const err = error as Error;
        toast({
          title: 'Erreur',
          description: err.message || 'Erreur lors du paiement Wave',
          variant: 'destructive',
        });
      } finally {
        setProcessingPayment(false);
      }
      return;
    }
    
    // Pour les autres modes de paiement (si existants), continuer avec l'ancien flow
    try {
      setProcessingPayment(true);
      const { res: response, data } = await fetchJsonWithTimeout<PayDunyaResponse>(
        apiUrl('/api/payments/create-order-and-invoice'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            buyer_id: user.id,
            product_id: searchResult.id,
            vendor_id: searchResult.vendor_id,
            total_amount: searchResult.price * purchaseQuantity,
            payment_method: paymentMethod,
            buyer_phone: userProfile?.phone || '',
            delivery_address: userProfile?.address || authUserProfile?.address || 'Adresse à définir',
            description: searchResult.description,
            storeName: searchResult.profiles?.full_name || searchResult.profiles?.company_name || 'Boutique'
          })
        },
        60000 // 60 secondes pour gérer le cold start
      );

      if (!response.ok || data?.status !== 'success' || !data?.token) {
        throw new Error(data?.message || 'Erreur serveur PayDunya');
      }
      setPendingOrderToken(data.token || null);
      setReceiptUrl(data.receipt_url || null);
      setOrderId(data.order_id || null);
      // Afficher le QR code sécurisé pour le client
      if (data.qr_code) {
        setQrModalValue(data.qr_code);
        setQrModalOpen(true);
      }
      if (paydunyaMode === 'sandbox') {
        setShowDirectPaymentForm(true);
        return;
      }
      // En prod, paiement direct
      const fullName = userProfile?.full_name || '';
      const email = user?.email || '';
      const phone = userProfile?.phone || '';
      if (paymentMethod === 'wave') {
        // Paiement Wave : redirection immédiate
        const { data: result } = await fetchJsonWithTimeout<SoftPayResponse>(
          apiUrl('/api/payments/softpay/wave'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, email, phone, payment_token: data.token })
          },
          45000
        );
        if (result?.success && result?.url) {
          window.location.href = result.url;
        } else {
          throw new Error(result?.message || 'Erreur paiement Wave');
        }
      } else if (paymentMethod === 'orange_money') {
        setShowOrangeChoiceModal(true);
        setOnOrangeChoice(() => async (choice: 'qr' | 'otp') => {
          setShowOrangeChoiceModal(false);
          const fullName = userProfile?.full_name || '';
          const email = user?.email || '';
          const phone = formatPhoneForOrangeMoney(userProfile?.phone || '');
          if (choice === 'qr') {
            // QR Code : redirection immédiate
            const { data: result } = await fetchJsonWithTimeout<SoftPayResponse>(
              apiUrl('/api/payments/softpay/orange'),
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  customer_name: fullName,
                  customer_email: email,
                  phone_number: phone,
                  invoice_token: data.token,
                  api_type: 'QRCODE'
                })
              },
              45000
            );
            if (result?.success && result?.url) {
              window.location.href = result.url;
            } else {
              throw new Error(result?.message || 'Erreur paiement Orange Money QR');
            }
          } else {
            // OTP : afficher mini-formulaire OTP
            setPendingOtpInfo({ fullName, email, phone, token: data.token ?? '' });
            setShowOtpForm(true);
          }
        });
        return;
      }
    } catch (error) {
      const err = error as Error;
      let errorMessage = err.message || 'Erreur lors de la création de la commande';
      
      // Vérifier si c'est une erreur de réseau
      if (!navigator.onLine || err.name === 'TypeError' || err.message?.includes('fetch')) {
        errorMessage = 'Connexion internet perdue. Vérifiez votre connexion et réessayez.';
      } else if (err.name === 'AbortError') {
        errorMessage = 'Le serveur met trop de temps à répondre. Réessayez.';
      }
      
      toast({
        title: 'Erreur',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setProcessingPayment(false);
    }
  };

  // Nouvelle fonction pour effectuer le paiement direct
  const handleDirectPayment = async (phone: string, password: string, email: string) => {
    if (!pendingOrderToken) return;
    setProcessingPayment(true);
    try {
      const response = await fetch(apiUrl('/api/payments/payment'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: pendingOrderToken,
          phone_number: phone,
          customer_email: email,
          password: password,
        })
      });
      const parsed = await safeJson(response);
      if (parsed && typeof parsed === 'object' && '__parseError' in parsed) {
        const err = new Error('Réponse invalide du serveur (JSON attendu).') as Error & { status?: number; body?: unknown };
        err.status = response.status;
        // Use unknown cast to avoid TS conversion errors and default to empty string if missing
        err.body = { raw: (parsed as unknown as { __raw?: string }).__raw || '' };
        throw err;
      }
      const data = (parsed ?? {}) as any;

      if (!response.ok) {
        const err = new Error(data?.message || data?.error || 'Erreur lors du paiement') as Error & { status?: number; body?: unknown };
        err.status = response.status;
        err.body = data;
        throw err;
      }
      if (data.status === 'success') {
        setShowDirectPaymentForm(false);
        setPendingOrderToken(null);
        setReceiptUrl(data.receipt_url || receiptUrl);
        navigate(orderId ? `/payment-success?order_id=${orderId}` : '/payment-success');
      } else {
        throw new Error(data?.message || 'Paiement échoué');
      }
    } catch (error) {
      toast({
        title: 'Erreur',
        description: toFrenchErrorMessage(error, 'Erreur lors du paiement'),
        variant: 'destructive',
      });
    } finally {
      setProcessingPayment(false);
    }
  };

  // Télécharger le QR code (fetch blob puis trigger download) ✅
  const handleDownloadQr = async () => {
    if (!qrModalValue) {
      toast({ title: 'Erreur', description: 'QR code manquant', variant: 'destructive' });
      return;
    }
    try {
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(qrModalValue)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Erreur téléchargement');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const filename = orderId ? `qr-order-${orderId}.png` : 'qr-code.png';
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      toast({ title: 'Téléchargé', description: `QR enregistré (${filename})` });
    } catch (e) {
      console.error('Download QR error', e);
      toast({ title: 'Erreur', description: 'Impossible de télécharger le QR', variant: 'destructive' });
    }
  };

  // Partager le QR code (Web Share API / fallback vers clipboard ou téléchargement)
  const handleShareQr = async () => {
    if (!qrModalValue) {
      toast({ title: 'Erreur', description: 'QR code manquant', variant: 'destructive' });
      return;
    }
    try {
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(qrModalValue)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Erreur préparation du QR');
      const blob = await res.blob();
      const file = new File([blob], orderId ? `qr-order-${orderId}.png` : 'qr-code.png', { type: blob.type });

      // Prefer sharing the image file when supported
      const nav = navigator as unknown as NavigatorShareWithFiles;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share?.({ files: [file], title: 'QR code', text: 'QR code de la commande' });
        toast({ title: 'Partagé', description: 'QR code partagé' });
        setQrModalOpen(false);
        return;
      }

      // Fallback: use navigator.share with url or text if available
      if (nav.share) {
        await nav.share({ title: 'QR code', text: qrModalValue, url });
        toast({ title: 'Partagé', description: 'QR code partagé' });
        setQrModalOpen(false);
        return;
      }

      // Fallback: copy the raw QR payload to clipboard if possible
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(qrModalValue);
        toast({ title: 'Copié', description: 'Le code QR a été copié dans le presse-papiers' });
        return;
      }

      // Final fallback: trigger a download silently
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      toast({ title: 'Téléchargé', description: `QR code téléchargé (${file.name})` });
    } catch (e) {
      console.error('Share QR error', e);
      toast({ title: 'Erreur', description: 'Impossible de partager le QR', variant: 'destructive' });
    }
  };

  // Ajout de la fonction de traduction du statut
  const getStatusTextFr = (status: string) => {
    switch (status) {
      case 'pending': return 'En attente';
      case 'paid': return 'Payée';
      case 'in_delivery': return 'En cours de livraison';
      case 'delivered': return 'Livrée';
      case 'cancelled': return 'Annulée';
      case 'refunded': return 'Remboursée';
      default: return status;
    }
  };


  const renderStatusBadge = (status?: string) => {
    if (!status) return null;
    const text = getStatusTextFr(status);
    // mapping to styles
    let bg = 'bg-gray-100 text-gray-700';
    let dot = 'bg-gray-400';
    if (status === 'in_delivery') { bg = 'bg-blue-100 text-blue-700'; dot = 'bg-blue-500'; }
    else if (status === 'paid') { bg = 'bg-purple-100 text-purple-700'; dot = 'bg-purple-500'; }
    else if (status === 'delivered') { bg = 'bg-black/5 text-black'; dot = 'bg-black'; }
    else if (status === 'pending') { bg = 'bg-yellow-100 text-yellow-700'; dot = 'bg-yellow-500'; }
    else if (status === 'cancelled') { bg = 'bg-red-100 text-red-700'; dot = 'bg-red-500'; }

    return (
      <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${bg}`} role="status" aria-label={text}>
        <span className={`w-2 h-2 rounded-full ${dot} flex-shrink-0`} />
        <span className="leading-none">{text}</span>
      </span>
    );
  };

  // Fonction de demande de remboursement
  const handleRequestRefund = async () => {
    if (!refundOrder) return;

    setRefundLoading(true);
    try {
      console.log('[REFUND] Demande de remboursement pour commande:', refundOrder.id);
      
      const smsSessionStr = typeof window !== 'undefined' ? localStorage.getItem('sms_auth_session') : null;
      const sms = smsSessionStr ? JSON.parse(smsSessionStr || '{}') : null;
      let token = sms?.access_token || sms?.token || sms?.jwt || '';
      if (!token) {
        try {
          const sessRes = await supabase.auth.getSession();
          token = sessRes?.data?.session?.access_token || '';
        } catch (e) {
          token = '';
        }
      }

      const response = await fetch(apiUrl('/api/payment/pixpay/refund'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          orderId: refundOrder.id,
          reason: refundReason || 'Non satisfaction client'
        }),
      });

      const parsed = await safeJson(response);
      if (parsed && typeof parsed === 'object' && '__parseError' in parsed) {
        const err = new Error('Réponse invalide du serveur (JSON attendu).') as Error & { status?: number; body?: unknown };
        err.status = response.status;
        err.body = { raw: (parsed as unknown as { __raw?: string }).__raw || '' };
        throw err;
      }
      const result = (parsed ?? {}) as any;
      console.log('[REFUND] Résultat:', result);

      if (!response.ok) {
        const err = new Error(result?.error || result?.message || 'Erreur lors de la demande de remboursement') as Error & { status?: number; body?: unknown };
        err.status = response.status;
        err.body = result;
        throw err;
      }

      if (result.success) {
        toast({
          title: "✅ Demande envoyée",
          description: result.message || `Votre demande de remboursement de ${refundOrder.total_amount} FCFA a été soumise. Elle sera examinée par un administrateur.`,
          duration: 8000,
        });
        
        // Optimistic UI update: mark the order as cancelled locally so buyer sees immediate feedback
        setOrders((prev) => prev.map(o => (o.id === refundOrder.id ? { ...o, status: 'cancelled' } : o)));

        // Fermer le modal et rafraîchir les commandes et transactions
        setShowRefundModal(false);
        setRefundOrder(null);
        setRefundReason('');
        fetchOrders();
        fetchTransactions();
      } else {
        throw new Error(result.error || 'Erreur lors de la demande de remboursement');
      }
    } catch (error) {
      console.error('[REFUND] Erreur:', error);
      toast({
        title: "❌ Échec de la demande",
        description: error instanceof Error ? error.message : 'Erreur inconnue',
        variant: "destructive",
      });
    } finally {
      setRefundLoading(false);
    }
  };

  // Ouvrir le modal de remboursement
  const openRefundModal = (order: Order) => {
    setRefundOrder(order);
    setRefundReason('');
    setShowRefundModal(true);
  };

  // Helper pour ouvrir les liens de paiement avec WebView intégrée
  const openPaymentLink = async (url: string) => {
    try {
      if (Capacitor.isNativePlatform()) {
        // Sur mobile: ouvrir dans une WebView intégrée sans navigateur externe
        setPaymentWebViewUrl(url);
        setShowPaymentWebView(true);
      } else {
        // Sur web: ouvrir dans un nouvel onglet
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error('Erreur ouverture lien paiement:', error);
      // Fallback
      window.open(url, '_blank');
    }
  };

  // Fonction appelée quand le paiement est validé dans la WebView
  const handlePaymentWebViewSuccess = (completedOrderId?: string) => {
    setShowPaymentWebView(false);
    setPaymentWebViewUrl('');
    
    const finalOrderId = completedOrderId || orderId;
    if (finalOrderId) {
      navigate(`/payment-success?order_id=${finalOrderId}`);
    } else {
      toast({
        title: "Succès",
        description: "Paiement effectué avec succès",
      });
      fetchOrders();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">


      {/* Spinner overlay uniquement lors du paiement Wave ou Orange Money */}
      {processingPayment && (
        <div className="fixed inset-0 z-[100] bg-black bg-opacity-50 flex items-center justify-center backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 bg-white rounded-lg px-8 py-6 shadow-xl">
            <Spinner size="xl" />
            <span className="text-lg font-semibold text-gray-700">Paiement en cours...</span>
          </div>
        </div>
      )}

      {/* Header Client moderne - utilise la couleur primaire (comme espace livreur) */}
      <header className="bg-primary rounded-b-2xl shadow-lg mb-6 sticky top-0 z-40 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col items-center md:items-start">
            <h1 className="text-3xl md:text-4xl font-extrabold text-white drop-shadow-lg text-center tracking-tight">
              Validèl
            </h1>
            <p className="text-white/90 text-sm mt-1">Espace Client</p>
          </div>
          {/* Profil masqué dans l'entête — accessible via le bouton Paramètres (drawer) */}
          {/* Bouton paramètres */}
          <button
            className="hidden md:flex absolute top-6 right-8 items-center justify-center w-10 h-10 rounded-full hover:bg-white/10"
            onClick={() => { setDrawerOpen(true); }}
            aria-label="Paramètres"
          >
            <Settings className="h-5 w-5 text-white" />
          </button>
          {/* Hamburger mobile à gauche */}
          <button
            className="md:hidden absolute top-6 left-6 flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/10"
            onClick={() => { setDrawerOpen(true); }}
            aria-label="Paramètres"
          >
            <Settings className="h-5 w-5 text-white" />
          </button>
        </div>
      </header>



      {/* Debug panel (visible when ?debug=1) */}
      {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1' && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-4">
          <div className="rounded border p-3 bg-white text-sm text-gray-700">
            <strong>Debug:</strong>
            <div>user.id: {user?.id || 'null'}</div>
            <div>authProfile.id: {authUserProfile?.id || 'null'}</div>
            <div>sms_auth_session: {localStorage.getItem('sms_auth_session') ? 'yes' : 'no'}</div>
            <div>orders: {orders.length}</div>
            <div>ordersLoading: {String(ordersLoading)}</div>
            <div>transactions: {transactions.length}</div>
          </div>
        </div>
      )}

      {/* Drawer de profil */}
      {drawerOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.3)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 32, minWidth: 320, boxShadow: '0 4px 24px #0002', maxWidth: '90vw' }}>
            <h2 style={{ fontWeight: 700, fontSize: 20, marginBottom: 16 }}>Mon profil</h2>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontWeight: 500, fontSize: 14 }}>Nom complet</label>
              <input
                type="text"
                value={editProfile.full_name}
                onChange={e => setEditProfile(p => ({ ...p, full_name: e.target.value }))}
                style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ddd', marginTop: 4, marginBottom: 12 }}
                placeholder="Votre nom complet"
              />
              <label style={{ fontWeight: 500, fontSize: 14 }}>Téléphone</label>
              <input
                type="tel"
                inputMode="tel"
                pattern="[0-9+\s-]*"
                value={editProfile.phone}
                onChange={e => setEditProfile(p => ({ ...p, phone: e.target.value }))}
                style={{ width: '100%', padding: '16px 14px', fontSize: 20, borderRadius: 6, border: '1px solid #ddd', marginTop: 4, marginBottom: 12, minHeight: 56 }}
                placeholder="Votre numéro de téléphone"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  style={{ flex: 1, background: '#111827', color: 'white', border: 'none', borderRadius: 6, padding: '10px 0', fontWeight: 600, fontSize: 16, cursor: 'pointer', opacity: savingProfile ? 0.7 : 1 }}
                >
                  {savingProfile ? 'Enregistrement...' : 'Enregistrer'}
                </button>
                <button
                  onClick={() => setDrawerOpen(false)}
                  style={{ flex: 1, background: '#eee', color: '#333', border: 'none', borderRadius: 6, padding: '10px 0', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}
                >
                  Annuler
                </button>
              </div>
              <button
                onClick={handleSignOut}
                style={{ width: '100%', background: '#111827', color: 'white', border: 'none', borderRadius: 6, padding: '10px 0', fontWeight: 600, fontSize: 16, marginTop: 8, cursor: 'pointer' }}
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Colonne de gauche - Recherche et produit */}
          <div className="lg:col-span-2 space-y-6">
            {/* Recherche de produit */}
            <Card className="w-full">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Search className="h-5 w-5 text-gray-500" />
                  <span>Rechercher un produit</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                <form className="flex items-center gap-2 w-full" onSubmit={e => { e.preventDefault(); handleSearch(); }}>
                  <Input
                    className="flex-1 min-w-0 text-base px-3 py-2 rounded-md"
                    placeholder="Code produit..."
                    value={searchCode}
                    onChange={e => setSearchCode(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && handleSearch()}
                    style={{ maxWidth: 180 }}
                  />
                  <Button
                    type="submit"
                    className="px-4 py-2 text-base rounded-md"
                    style={{ minWidth: 0 }}
                    disabled={searchLoading}
                  >
                    {searchLoading ? <Spinner size="sm" /> : 'Rechercher'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Colonne de droite - Profil & Commandes */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <ShoppingCart className="h-5 w-5" />
                  <span>Mes commandes</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  // Afficher un placeholder même si des commandes existent mais sont toutes en statut pending
                  const displayedOrders = (showAllOrders
                    ? orders.filter(order => order.status !== 'pending')
                    : orders.filter(order => order.status !== 'pending').slice(0, 5)
                  );

                  if (ordersLoading) {
                    return (
                      <div className="flex justify-center py-4">
                        <Spinner size="sm" />
                      </div>
                    );
                  }

                  if (displayedOrders.length === 0) {
                    return (
                      <p className="text-gray-500 text-center py-4">Aucune commande pour le moment</p>
                    );
                  }

                  return (
                    <div className="space-y-3 flex flex-col items-center justify-center">
                      {displayedOrders.map((order) => {
                        // Trouver les transactions associées à cette commande
                        const orderTransactions = transactions.filter(t => t.order_id === order.id);
                        const paymentTransaction = orderTransactions.find(t => t.transaction_type !== 'payout');
                        const payoutTransaction = orderTransactions.find(t => t.transaction_type === 'payout');
                        const isExpanded = expandedOrderIds.has(order.id);
                        const toggleDetails = () => {
                          setExpandedOrderIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(order.id)) {
                              next.delete(order.id);
                            } else {
                              next.add(order.id);
                            }
                            return next;
                          });
                        };
                        
                        return (
                        <div key={order.id} className="rounded-xl border border-gray-200 bg-white p-6 shadow-md transition hover:shadow-lg w-full max-w-[calc(100vw-32px)] min-w-[240px] mx-auto sm:mx-auto sm:min-w-[340px] sm:max-w-[520px]" style={{marginLeft: 0, marginRight: 0}}>
                          <div className="flex flex-col gap-4">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 w-full">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-3">
                                  <p className="font-bold text-gray-900 break-words text-lg sm:truncate">
                                    {order.products?.name || 'Commande'}
                                  </p>
                                  <div className="flex items-center gap-3">
                                    <span className="text-lg font-bold text-black">
                                      {order.total_amount?.toLocaleString()} FCFA
                                    </span>
                                  </div>
                                </div>
                                <div className="mt-3 space-y-2 text-base text-gray-700">
                                  <div className="flex flex-col gap-2 pb-2">
                                    <div className="flex items-center gap-4">
                                      <span className="font-semibold text-gray-700 text-base whitespace-nowrap">Vendeur(se):</span>
                                      <span className="flex-1 min-w-0 break-words sm:truncate text-base">{order.profiles?.company_name || 'N/A'}</span>
                                    </div>
                                    {order.profiles?.phone && (
                                      <div className="flex items-center gap-3 text-base">
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                              <a
                                                href={`tel:${order.profiles.phone}`}
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 transition min-w-[40px]"
                                                aria-label="Appeler le vendeur(se)"
                                              >
                                                <PhoneIcon className="h-5 w-5" size={18} />
                                                <span className="ml-1 text-base leading-tight">Appeler</span>
                                              </a>
                                            </TooltipTrigger>
                                            <TooltipContent>Appeler le vendeur(se)</TooltipContent>
                                        </Tooltip>
                                        <a
                                            href={`https://wa.me/${order.profiles.phone.replace(/^\+/, '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-black/5 text-black text-sm font-semibold hover:bg-black/10 transition min-w-[40px]"
                                            title="Contacter sur WhatsApp"
                                          >
                                            <WhatsAppIcon className="h-5 w-5" size={18} />
                                            <span className="ml-1 text-base leading-tight">WhatsApp</span>
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                  {(order.delivery_person || order.status === 'in_delivery' || order.status === 'delivered') && (
                                    <div className="flex flex-col gap-2 mt-4">
                                      {order.delivery_person?.phone ? (
                                        <div className="flex items-center gap-4 text-base">
                                          <span className="font-semibold text-gray-700 text-base whitespace-nowrap">Livreur:</span>
                                          <div className="flex items-center gap-3">
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <a
                                                  href={`tel:${order.delivery_person.phone}`}
                                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 transition min-w-[40px]"
                                                  aria-label="Appeler le livreur"
                                                >
                                                  <PhoneIcon className="h-5 w-5" size={18} />
                                                  <span className="ml-1 text-base leading-tight">Appeler</span>
                                                </a>
                                              </TooltipTrigger>
                                              <TooltipContent>Appeler le livreur</TooltipContent>
                                            </Tooltip>
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>



                            {/* Affichage du statut de paiement vendeur(se) après livraison */}
                            {order.status === 'delivered' && payoutTransaction && (
                              <div className="rounded-md bg-purple-50 p-2">
                                <p className="text-xs font-medium text-purple-700">
                                  Paiement vendeur(se):
                                  <span
                                    className={
                                      `ml-2 inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ` +
                                      (payoutTransaction.status === 'SUCCESSFUL'
                                        ? 'bg-black/5 text-black'
                                        : payoutTransaction.status === 'PENDING1' || payoutTransaction.status === 'PENDING'
                                          ? 'bg-yellow-100 text-yellow-700'
                                          : 'bg-red-100 text-red-700')
                                    }
                                  >
                                    {payoutTransaction.status === 'SUCCESSFUL'
                                      ? '✓ Effectué'
                                      : payoutTransaction.status === 'PENDING1' || payoutTransaction.status === 'PENDING'
                                        ? '⏳ En cours'
                                        : '✗ Échoué'}
                                  </span>
                                </p>
                              </div>
                            )}

                            {/* Affichage du remboursement si existant */}
                            {order.status === 'cancelled' && orderTransactions.find(t => t.transaction_type === 'refund') && (
                              <div className="rounded-md bg-orange-50 p-2">
                                <p className="text-xs font-medium text-orange-700">
                                  💸 Remboursement:
                                  <span
                                    className={
                                      `ml-2 inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ` +
                                      (orderTransactions.find(t => t.transaction_type === 'refund')?.status === 'SUCCESSFUL'
                                        ? 'bg-black/5 text-black'
                                        : 'bg-yellow-100 text-yellow-700')
                                    }
                                  >
                                    {orderTransactions.find(t => t.transaction_type === 'refund')?.status === 'SUCCESSFUL'
                                      ? '✓ Effectué'
                                      : '⏳ En cours'}
                                  </span>
                                </p>
                              </div>
                            )}



                            {/* Boutons d'action */}
                            <div className="flex flex-wrap gap-2 mt-2">
                              {order.qr_code ? (
                                <button
                                  className="rounded-md border border-orange-400 px-3 py-2 text-sm font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 shadow-sm transition-all w-full sm:w-auto min-h-[44px]"
                                  style={{ fontSize: 15, borderWidth: 1.5, borderRadius: 7 }}
                                  onClick={() => { setQrModalValue(order.qr_code ?? ''); setQrModalOpen(true); }}
                                >
                                  Voir QR code
                                </button>
                              ) : (
                                <span className="text-sm text-gray-400">QR code indisponible</span>
                              )}

                              <button
                                className="rounded-md border border-black px-3 py-1.5 text-sm font-medium text-black bg-black/5 hover:bg-black/10 shadow-sm transition-all min-h-[32px] flex-1 min-w-0"
                                style={{ fontSize: 15, borderWidth: 1.5, borderRadius: 7 }}
                                onClick={() => openInvoiceInModal(`/api/orders/${order.id}/invoice`, 'Facture de la commande', true)}
                              >
                                Voir facture
                              </button>

                              <button
                                className="rounded-md border border-blue-500 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 shadow-sm transition-all min-h-[32px] flex-1 min-w-0"
                                style={{ fontSize: 15, borderWidth: 1.5, borderRadius: 7 }}
                                onClick={toggleDetails}
                              >
                                {isExpanded ? 'Masquer les détails' : 'Détails'}
                              </button>
                            </div>

                            {isExpanded && (
                              <div className="flex flex-wrap gap-2">
                                {/* Bouton d'annulation/remboursement - visible uniquement après Détails */}
                                {(order.status === 'paid' || order.status === 'in_delivery') && (
                                  <button
                                    className="flex items-center gap-1 rounded-md border border-red-500 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 min-w-[32px]"
                                    onClick={() => openRefundModal(order)}
                                  >
                                    <XCircle size={14} />
                                    Annuler / Remboursement
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Suppression du doublon prix/statut */}

                            {/* Statut (déplacé en bas de la carte) */}
                            <div className="mt-4">
                              <div className="text-sm flex items-center gap-2">
                                {renderStatusBadge(order.status)}
                              </div>
                            </div>
                          </div>
                        </div>
                        );
                      })}
                      {!showAllOrders && orders.filter(order => order.status !== 'pending').length > 5 && (
                        <Button variant="outline" size="sm" className="w-full" onClick={() => setShowAllOrders(true)}>
                          Voir toutes les commandes
                        </Button>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Modal QR Code */}
      {qrModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.3)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 4px 24px #0002', minWidth: 240, maxWidth: '90vw', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
            <h3 style={{ marginBottom: 8 }}>QR Code de la commande</h3>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrModalValue)}`}
              alt="QR Code"
              style={{ width: 180, height: 180, objectFit: 'contain', display: 'block', margin: '0 auto', borderRadius: 8 }}
            />

            {/* Boutons: Partager et Fermer (tailles réduites) */}
            <div style={{ marginTop: 8, display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
              <button
                onClick={() => setQrModalOpen(false)}
                style={{ padding: '8px 12px', borderRadius: 6, background: '#ff9800', color: 'white', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal facture */}
      <Dialog open={invoiceViewerOpen} onOpenChange={setInvoiceViewerOpen}>
        <DialogContent className="w-full max-w-4xl mx-4 sm:mx-auto max-h-[90vh] overflow-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{invoiceViewerTitle}</DialogTitle>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {invoiceViewerLoading && <div className="flex justify-center py-8"><Spinner /></div>}
            {!invoiceViewerLoading && invoiceViewerHtml && (
              <div>
                <div className="flex justify-end gap-2 mb-2">
                  <Button size="sm" onClick={downloadVisibleInvoice} className="bg-black text-white">Télécharger</Button>
                  <Button size="sm" variant="ghost" onClick={() => setInvoiceViewerOpen(false)}>Fermer</Button>
                </div>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                  <iframe title="invoice-preview" srcDoc={invoiceViewerHtml} style={{ width: '100%', height: (typeof window !== 'undefined' && window.innerWidth <= 640) ? 'calc(100vh - 140px)' : '70vh', border: 0 }} />
                </div>
              </div>
            )}
            {!invoiceViewerLoading && !invoiceViewerHtml && (
              <div className="text-center py-8 text-gray-500">Aucune facture à afficher</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {showDirectPaymentForm && (
        <Dialog open={showDirectPaymentForm} onOpenChange={setShowDirectPaymentForm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Paiement sécurisé</DialogTitle>
            </DialogHeader>
            <PaymentForm 
              orderId={orderId || ''}
              buyerPhone={userProfile?.phone || ''}
              amount={currentOrder?.total_amount || 0}
              onPaymentSuccess={() => {
                setShowDirectPaymentForm(false);
                setPendingOrderToken(null);
                navigate(orderId ? `/payment-success?order_id=${orderId}` : '/payment-success');
              }}
              onPaymentError={(error) => {
                toast({
                  title: 'Erreur',
                  description: error,
                  variant: 'destructive',
                });
              }}
              paydunya={{
                token: pendingOrderToken || '',
                onDirectPayment: handleDirectPayment
              }}
            />
          </DialogContent>
        </Dialog>
      )}
      {showSoftPayModal && (
        <Dialog open={showSoftPayModal} onOpenChange={setShowSoftPayModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Paiement sécurisé {softPayType === 'wave' ? 'Wave' : 'Orange Money'}</DialogTitle>
            </DialogHeader>
            {!softPayType && (
              <div className="mb-4">
                <Button className="w-full mb-2" onClick={() => setSoftPayType('orange_qr')}>Payer par QR Code Orange Money</Button>
                <Button className="w-full" onClick={() => setSoftPayType('orange_otp')}>Payer par Code OTP Orange Money</Button>
              </div>
            )}
            {softPayType && !softPayQrUrl && !softPayRedirectUrl && (
              <form className="space-y-4" onSubmit={async (e) => {
                e.preventDefault();
                setSoftPayLoading(true);
                setSoftPayError(null);
                setSoftPayQrUrl(null);
                setSoftPayRedirectUrl(null);
                const form = e.target as HTMLFormElement;
                const fullName = (form.elements.namedItem('fullName') as HTMLInputElement).value;
                const email = (form.elements.namedItem('email') as HTMLInputElement).value;
                const phone = (form.elements.namedItem('phone') as HTMLInputElement).value;
                let otp = '';
                if (softPayType === 'orange_otp') {
                  otp = (form.elements.namedItem('otp') as HTMLInputElement).value;
                }
                try {
                  let res;
                  if (softPayType === 'wave') {
                    res = await fetch(apiUrl('/api/payments/softpay/wave'), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        fullName,
                        email,
                        phone,
                        payment_token: pendingOrderToken
                      })
                    });
                    const data = await res.json();
                    if (data.success && data.url) {
                      setSoftPayRedirectUrl(data.url);
                      await openPaymentLink(data.url);
                      setShowSoftPayModal(false);
                    } else {
                      throw new Error(data.message || 'Erreur paiement Wave');
                    }
                  } else if (softPayType === 'orange_qr') {
                    res = await fetch(apiUrl('/api/payments/softpay/orange'), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        customer_name: fullName,
                        customer_email: email,
                        phone_number: phone,
                        invoice_token: pendingOrderToken,
                        api_type: 'QRCODE'
                      })
                    });
                    const data = await res.json();
                    if (data.success && data.url) {
                      setSoftPayQrUrl(data.url);
                      await openPaymentLink(data.url);
                      setShowSoftPayModal(false);
                    } else {
                      throw new Error(data.message || 'Erreur paiement Orange Money QR');
                    }
                  } else if (softPayType === 'orange_otp') {
                    res = await fetch(apiUrl('/api/payments/softpay/orange'), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        customer_name: fullName,
                        customer_email: email,
                        phone_number: phone,
                        invoice_token: pendingOrderToken,
                        api_type: 'OTPCODE',
                        authorization_code: otp
                      })
                    });
                    const data = await res.json();
                    if (data.success) {
                      toast({ title: 'Succès', description: data.message || 'Paiement Orange Money OTP effectué.' });
                      setShowSoftPayModal(false);
                      // Optionnel : rediriger ou rafraîchir les commandes
                    } else {
                      throw new Error(data.message || 'Erreur paiement Orange Money OTP');
                    }
                  }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (err: any) {
                  setSoftPayError(err.message);
                } finally {
                  setSoftPayLoading(false);
                }
              }}>
                <Input name="fullName" placeholder="Nom complet" required defaultValue={userProfile?.full_name || ''} />
                <Input name="email" type="email" placeholder="Email" required defaultValue={user?.email || ''} />
                <Input 
                  name="phone" 
                  type="tel" 
                  inputMode="tel"
                  pattern="[0-9+\s-]*"
                  placeholder="Téléphone" 
                  required 
                  defaultValue={userProfile?.phone || ''} 
                  className="text-xl h-14 md:text-base md:h-10"
                  style={{ fontSize: '20px' }}
                />
                {softPayType === 'orange_otp' && (
                  <Input 
                    name="otp" 
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Code OTP Orange Money" 
                    required 
                    className="text-xl h-14 md:text-base md:h-10"
                    style={{ fontSize: '20px' }}
                  />
                )}
                {softPayError && <div className="text-red-600 text-sm">{softPayError}</div>}
                <Button type="submit" className="w-full" disabled={softPayLoading}>
                  {softPayLoading ? 'Paiement en cours...' : 'Valider le paiement'}
                </Button>
              </form>
            )}
            {/* Affichage QR ou redirection si besoin */}
            {softPayQrUrl && (
              <div className="text-center">
                <p className="mb-2">Scannez ce QR code avec votre application Orange Money :</p>
                <img src={softPayQrUrl} alt="QR Code Orange Money" style={{ maxWidth: 220, margin: '0 auto' }} />
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
      {showOtpForm && pendingOtpInfo && (
        <Dialog open={showOtpForm} onOpenChange={setShowOtpForm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Paiement Orange Money - Code OTP</DialogTitle>
            </DialogHeader>
            <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm text-center sm:text-left" style={{ fontSize: '1em', lineHeight: 1.5 }}>
              <span style={{ display: 'block', marginBottom: 4 }}>Pour obtenir le code OTP, composez&nbsp;:</span>
              <span className="font-mono font-bold text-yellow-900 text-base break-all" style={{ wordBreak: 'break-all' }}>
                #144#391*VOTRE_CODE_SECRET#
              </span>
            </div>
            <form className="space-y-4" onSubmit={async (e) => {
              e.preventDefault();
              setOtpLoading(true);
              setOtpError(null);
              const form = e.target as HTMLFormElement;
              const otp = (form.elements.namedItem('otp') as HTMLInputElement).value;
              try {
                const res = await fetch(apiUrl('/api/payments/softpay/orange'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    customer_name: pendingOtpInfo.fullName,
                    customer_email: pendingOtpInfo.email,
                    phone_number: pendingOtpInfo.phone,
                    invoice_token: pendingOtpInfo.token,
                    api_type: 'OTPCODE',
                    authorization_code: otp
                  })
                });
                const result = await res.json();
                if (result.success) {
                  toast({ title: 'Succès', description: result.message || 'Paiement Orange Money OTP effectué.' });
                  setShowOtpForm(false);
                  setPendingOtpInfo(null);
                  // Optionnel : rediriger ou rafraîchir les commandes
                } else {
                  throw new Error(result.message || 'Erreur paiement Orange Money OTP');
                }
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } catch (err: any) {
                setOtpError(err.message);
              } finally {
                setOtpLoading(false);
              }
            }}>
              <Input name="otp" placeholder="Code OTP Orange Money" required />
              {otpError && <div className="text-red-600 text-sm">{otpError}</div>}
              <Button type="submit" className="w-full" disabled={otpLoading}>
                {otpLoading ? 'Paiement en cours...' : 'Valider le paiement'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {showOrangeChoiceModal && (
        <Dialog open={showOrangeChoiceModal} onOpenChange={setShowOrangeChoiceModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Choisissez le mode de paiement Orange Money</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 mt-4">
              <Button className="w-full bg-black hover:bg-black/80 text-white" onClick={() => onOrangeChoice && onOrangeChoice('qr')}>
                Payer par QR Code
              </Button>
              <Button className="w-full bg-yellow-500 hover:bg-yellow-600" onClick={() => onOrangeChoice && onOrangeChoice('otp')}>
                Payer par OTP
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setShowOrangeChoiceModal(false)}>
                Annuler
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {receiptUrl && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 1000 }}>
          <a href={receiptUrl} target="_blank" rel="noopener noreferrer">
            <Button className="w-full mt-4">Télécharger la facture</Button>
          </a>
        </div>
      )}

      {/* Modal de remboursement/annulation */}
      {showRefundModal && refundOrder && (
        <Dialog open={showRefundModal} onOpenChange={setShowRefundModal}>
          <DialogContent className="w-full max-w-lg mx-4 sm:mx-auto max-h-[90vh] overflow-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Annuler et demander un remboursement
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Résumé de la commande */}
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-semibold">{refundOrder.products?.name}</p>
                <p className="text-sm text-gray-600">Montant: {refundOrder.total_amount?.toLocaleString()} FCFA</p>
                <p className="text-sm text-gray-600">Statut: {getStatusTextFr(refundOrder.status ?? '')}</p>
              </div>

              {/* Avertissement */}
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>ℹ️ Information:</strong> Votre demande de remboursement sera examinée par un administrateur. 
                  Une fois approuvée, le montant sera remboursé sur votre compte 
                  {refundOrder.payment_method === 'wave' ? ' Wave' : ' Orange Money'}.
                </p>
              </div>

              {/* Raison du remboursement */}
              <div>
                <label htmlFor="refund-reason" className="block text-sm font-medium mb-2">Raison de l'annulation (optionnel)</label>
                <select 
                  id="refund-reason"
                  title="Raison de l'annulation"
                  className="w-full border rounded-lg p-2"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                >
                  <option value="">Sélectionner une raison</option>
                  <option value="Produit non conforme">Produit non conforme</option>
                  <option value="Délai de livraison trop long">Délai de livraison trop long</option>
                  <option value="Erreur de commande">Erreur de commande</option>
                  <option value="Changement d'avis">Changement d'avis</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>

              {/* Boutons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button 
                  variant="outline" 
                  className="w-full sm:flex-1"
                  onClick={() => {
                    setShowRefundModal(false);
                    setRefundOrder(null);
                    setRefundReason('');
                  }}
                  disabled={refundLoading}
                >
                  Annuler
                </Button>
                <Button 
                  className="w-full sm:flex-1 bg-red-600 hover:bg-red-700"
                  onClick={handleRequestRefund}
                  disabled={refundLoading}
                >
                  {refundLoading ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      Traitement...
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 mr-2" />
                      Soumettre la demande
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* WebView pour le paiement intégré (mobile uniquement) */}
      <PaymentWebView
        url={paymentWebViewUrl}
        isOpen={showPaymentWebView}
        onClose={() => {
          setShowPaymentWebView(false);
          setPaymentWebViewUrl('');
        }}
        onSuccess={handlePaymentWebViewSuccess}
        orderId={orderId || undefined}
      />

      {/* Modal de résultat de recherche produit */}
      {searchModalOpen && searchResult && (
        <div className="fixed inset-0 z-[60] bg-black bg-opacity-70 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Package className="h-6 w-6 text-black" />
                Produit trouvé
              </h3>
              <button
                onClick={() => {
                  setSearchModalOpen(false);
                  setSearchResult(null);
                  setPurchaseQuantity(1);
                  setPaymentMethod('wave');
                  setSearchCode('');
                }}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Fermer la fenêtre"
                title="Fermer"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-gray-900">{searchResult.name}</h3>
                    <p className="text-gray-600 mt-2">{searchResult.description}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      <span className="font-medium">Vendeur(se):</span> {searchResult.profiles?.full_name || searchResult.profiles?.company_name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-black">{searchResult.price.toLocaleString()} FCFA</p>
                    <p className="text-sm text-gray-500 mt-1">Code: {searchResult.code}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 pt-4 border-t">
                  <label className="text-base font-medium">Quantité:</label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => setPurchaseQuantity(q => Math.max(1, q - 1))}
                      disabled={purchaseQuantity <= 1}
                      aria-label="Diminuer la quantité"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      type="number"
                      min="1"
                      inputMode="numeric"
                      value={purchaseQuantity}
                      onChange={(e) => {
                        const next = Number.parseInt(e.target.value, 10);
                        setPurchaseQuantity(Number.isFinite(next) && next > 0 ? next : 1);
                      }}
                      onBlur={() => setPurchaseQuantity(q => (q > 0 ? q : 1))}
                      className="w-24 h-12 text-center text-xl font-semibold md:h-10 md:text-lg"
                      style={{ fontSize: '20px' }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => setPurchaseQuantity(q => q + 1)}
                      aria-label="Augmenter la quantité"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <p className="text-2xl font-bold text-gray-900">
                    Total: {(searchResult.price * purchaseQuantity).toLocaleString()} FCFA
                  </p>
                </div>

                {/* Sélecteur de moyen de paiement */}
                <div className="pt-4">
                  <label className="text-base font-medium mb-2 block">Moyen de paiement</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('wave')}
                      className={`py-2 px-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${
                        paymentMethod === 'wave' 
                          ? 'border-black bg-black/5' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <img src={waveLogo} alt="Wave" style={{ height: 32, width: 32, objectFit: 'contain', borderRadius: 6, background: '#fff' }} />
                      <span className="text-sm font-semibold">Wave</span>
                      {paymentMethod === 'wave' && (
                        <div className="w-4 h-4 rounded-full bg-black flex items-center justify-center">
                          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('orange_money')}
                      className={`py-2 px-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${
                        paymentMethod === 'orange_money' 
                          ? 'border-orange-500 bg-orange-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <img src={orangeMoneyLogo} alt="Orange Money" style={{ height: 32, width: 32, objectFit: 'contain', borderRadius: 6, background: '#fff' }} />
                      <span className="text-sm font-semibold">Orange Money</span>
                      {paymentMethod === 'orange_money' && (
                        <div className="w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center">
                          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t bg-gray-50">
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchModalOpen(false);
                    setSearchResult(null);
                    setPurchaseQuantity(1);
                    setPaymentMethod('wave');
                    setSearchCode('');
                  }}
                  className="flex-1"
                >
                  Annuler
                </Button>
                <Button
                  onClick={handleCreateOrderAndShowPayment}
                  disabled={processingPayment}
                  className={`flex-1 ${paymentMethod === 'wave' ? 'bg-black hover:bg-black/80 text-white' : 'bg-orange-600 hover:bg-orange-700'}`}
                >
                  {processingPayment ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      Traitement...
                    </>
                  ) : (
                    <>
                      Payer avec {paymentMethod === 'wave' ? 'Wave' : 'Orange Money'}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BuyerDashboard;
