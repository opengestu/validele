/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Truck, QrCode, Package, CheckCircle, User, LogOut, Edit, XCircle } from 'lucide-react';
import { PhoneIcon } from './CustomIcons';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { postProfileUpdate, getProfileById, apiUrl } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';
import { toFrenchErrorMessage } from '@/lib/errors';

type ProfileRow = {
  full_name: string | null;
  phone?: string | null;
};

type DeliveryOrder = {
  id: string;
  status: string;
  order_code?: string | null;
  products?: { name?: string | null; code?: string | null } | null;
  buyer_profile?: { full_name?: string | null; phone?: string | null; address?: string | null } | null;
  vendor_profile?: { company_name?: string | null; phone?: string | null; address?: string | null } | null;
  delivery_address?: string | null;
  buyer_phone?: string | null;
  total_amount?: number | null;
};

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

const DeliveryDashboard = () => {
  const { user, signOut, userProfile: authUserProfile, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [savingProfile, setSavingProfile] = useState(false);
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [callTarget, setCallTarget] = useState<string | null>(null);
  const [loadingLocal, setLoading] = useState(false);

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
  const [userProfile, setUserProfile] = useState<ProfileRow | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
  const [myDeliveries, setMyDeliveries] = useState<DeliveryOrder[]>([]);
  const [transactions, setTransactions] = useState<Array<{id: string; order_id: string; status: string; amount?: number; transaction_type?: string; created_at: string}>>([]);
  const [takingOrderId, setTakingOrderId] = useState<string | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editProfile, setEditProfile] = useState<{ full_name: string; phone: string }>(
    {
      full_name: '',
      phone: ''
    }
  );

  // Controlled tab state from URL query param (supports ?tab=in_progress|completed|profile)
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'in_progress'|'completed'|'profile'>('in_progress');
  const handleTabChange = (val: string) => {
    if (!['in_progress','completed','profile'].includes(val)) return;
    setActiveTab(val as any);
    // update URL so external links can point to a specific section
    navigate(`/delivery?tab=${encodeURIComponent(val)}`, { replace: true });
  };
  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab && ['in_progress','completed','profile'].includes(tab)) {
      setActiveTab(tab as any);
    }
  }, [location.search]);

  useEffect(() => {
    const fetchOrCreateProfile = async () => {
      if (!user?.id) return;
      try {
        // Try loading a cached profile first to improve mobile UX
        if (typeof window !== 'undefined') {
          const cached = localStorage.getItem('auth_cached_profile_v1');
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              setUserProfile({ full_name: parsed.full_name || '', phone: parsed.phone || '' });
              setEditProfile({ full_name: parsed.full_name || '', phone: parsed.phone || '' });
              return;
            } catch (e) {
              console.warn('[DeliveryDashboard] failed to parse cached profile', e);
            }
          }
        }

        // Fallback: fetch profile from backend helper
        try {
          const profResp = await getProfileById(user.id).catch(() => null);
          let profDataObj: ProfileRow | null = null;
          if (profResp) {
            // getProfileById may return a wrapper { ok, json } or the profile object directly
            if (typeof profResp === 'object' && profResp !== null && 'json' in profResp && (profResp as { json: unknown }).json) {
              const jsonPart = (profResp as { json: unknown }).json;
              const candidateProfile = (jsonPart as { profile?: ProfileRow }).profile ?? (jsonPart as ProfileRow);
              if (candidateProfile && typeof candidateProfile === 'object') {
                profDataObj = {
                  full_name: (candidateProfile as ProfileRow).full_name ?? null,
                  phone: (candidateProfile as ProfileRow).phone ?? null
                };
              }
            } else if (typeof profResp === 'object' && profResp !== null) {
              const maybeUnknown = profResp as unknown;
              if (maybeUnknown && typeof maybeUnknown === 'object') {
                const rec = maybeUnknown as Record<string, unknown>;
                const hasFull = typeof rec['full_name'] === 'string';
                const hasPhone = typeof rec['phone'] === 'string';
                if (hasFull || hasPhone) {
                  profDataObj = {
                    full_name: hasFull ? String(rec['full_name']) : null,
                    phone: hasPhone ? String(rec['phone']) : null
                  };
                }
              }
            }
          }
          if (profDataObj && (profDataObj.full_name || profDataObj.phone)) {
            setUserProfile({ full_name: profDataObj.full_name || '', phone: profDataObj.phone || '' });
            setEditProfile({ full_name: profDataObj.full_name || '', phone: profDataObj.phone || '' });
          }
        } catch (e) {
          console.warn('[DeliveryDashboard] getProfileById failed', e);
        }
      } catch (e) {
        console.warn('[DeliveryDashboard] fetchOrCreateProfile failed', e);
      }
    };
    fetchOrCreateProfile();
  }, [user]);

  useEffect(() => {
    // Initial load when component mounts
    fetchDeliveries();
    fetchTransactions();

    if (!user?.id) return;
    const channelName = `delivery-orders-${user.id}`;

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `delivery_person_id=eq.${user.id}` }, (payload) => {
        console.log('DeliveryDashboard: Realtime order event', payload);
        fetchDeliveries();
        fetchTransactions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_transactions' }, (payload) => {
        console.log('DeliveryDashboard: Realtime transactions event', payload);
        fetchTransactions();
      })
      .subscribe();
    return () => {
      try { supabase.removeChannel(channel); } catch (e) { console.warn('[DeliveryDashboard] removeChannel failed', e); }
    };
  }, [user]);

  // Listen to app-level event when a delivery is started so we can refresh immediately
  useEffect(() => {
    const handler = (ev: Event) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload: any = (ev as CustomEvent)?.detail?.order;
        console.log('DeliveryDashboard: delivery:started event received', payload);
        if (payload) {
          // if it's for this user or it's in_delivery, ensure visible immediately
          if (String(payload.delivery_person_id) === String(user?.id) || payload.status === 'in_delivery') {
            setMyDeliveries(prev => {
              const exists = prev.some(p => p.id === payload.id);
              if (!exists) return [payload, ...prev];
              return prev.map(p => (p.id === payload.id ? payload : p));
            });
          }
        }
      } catch (e) {
        console.warn('delivery:started handler error', e);
      }

      // Trigger a full re-fetch for consistency
      fetchDeliveries();
      fetchTransactions();
    };

    window.addEventListener('delivery:started', handler as EventListener);
    return () => window.removeEventListener('delivery:started', handler as EventListener);
  }, [user]);

  const fetchDeliveries = async () => {
    if (!user?.id) return;

    try {
      // If user is using SMS-auth (no supabase session token), prefer backend fetch to bypass RLS
      const smsSessionStr = typeof window !== 'undefined' ? localStorage.getItem('sms_auth_session') : null;
      if (smsSessionStr) {
        try {
          console.log('[DeliveryDashboard] SMS session detected, calling backend /api/delivery/my-orders (SMS flow)');
          // Choose API host depending on environment. On real devices (non-localhost) prefer the configured API base or production.
          const smsApiHost = (typeof window !== 'undefined' && window.location && !/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname))
            ? (import.meta.env.VITE_API_BASE || 'https://validele.onrender.com')
            : (import.meta.env.VITE_DEV_BACKEND || 'http://localhost:5000');
          const resp = await fetch(`${smsApiHost}/api/delivery/my-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deliveryPersonId: user.id })
          });

          // Defensive parse and logging
                    let j: unknown = null;
                    let respText: string | null = null;
                    try {
                      const ct = resp.headers.get('content-type') || '';
                      if (ct.includes('application/json')) {
                        j = await resp.json();
                      } else {
                        respText = await resp.text();
                      }
                    } catch (parseErr) {
                      console.warn('[DeliveryDashboard] /api/delivery/my-orders (SMS) parse error:', parseErr);
                      try { respText = await resp.text(); } catch (e2) { respText = null; }
                    }
          
          
                    // Type-guard the parsed JSON before accessing `.orders`
                    if (resp.ok && j && typeof j === 'object' && 'orders' in (j as Record<string, unknown>) && Array.isArray((j as { orders?: unknown }).orders)) {
                      setDeliveries([]);
                      const ordersFromSms = (j as { orders: DeliveryOrder[] }).orders;
                      // Ensure we only keep driver-relevant statuses
                      const filteredSmsOrders = ordersFromSms.filter(o => ['assigned','in_delivery','delivered','cancelled'].includes(String(o.status)));
                      setMyDeliveries(filteredSmsOrders);
                      return; 
                    } else if (!resp.ok) {
                      console.warn('[DeliveryDashboard] /api/delivery/my-orders (SMS) returned non-ok status', resp.status, respText || j);

                      if (resp.status >= 500) {
                        // Server error: try production fallback *first* and log outcome (no toasts shown)
                        let fallbackSucceeded = false;
                        try {
                          const prodResp = await fetch('https://validele.onrender.com/api/delivery/my-orders', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ deliveryPersonId: user.id })
                          });
                          let prodJson: unknown = null;
                          try {
                            const ct2 = prodResp.headers.get('content-type') || '';
                            if (ct2.includes('application/json')) {
                              prodJson = await prodResp.json();
                            } else {
                              try { prodJson = await prodResp.text(); } catch (e) { prodJson = null; }
                            }
                          } catch (e) {
                            console.warn('[DeliveryDashboard] Prod fallback parse error', e);
                          }
                          if (
                            prodResp.ok &&
                            prodJson &&
                            typeof prodJson === 'object' &&
                            'orders' in (prodJson as Record<string, unknown>) &&
                            Array.isArray((prodJson as { orders?: unknown }).orders)
                          ) {
                            setDeliveries([]);
                            const prodOrders = (prodJson as { orders: DeliveryOrder[] }).orders;
                            const filteredProdOrders = prodOrders.filter(o => ['assigned','in_delivery','delivered','cancelled'].includes(String(o.status)));
                            setMyDeliveries(filteredProdOrders);
                            fallbackSucceeded = true; 
                          }
                        } catch (e) {
                          console.warn('[DeliveryDashboard] production fallback failed:', e);
                        }

                        if (!fallbackSucceeded) {
                          console.warn('[DeliveryDashboard] Unable to load deliveries from local backend or remote instance');
                        }
                      } else {
                        console.warn('[DeliveryDashboard] Delivery fetch returned non-ok status', resp.status);
                      }
                      // continue to client-side fetch fallback
                    }
        } catch (e) {
          console.warn('[DeliveryDashboard] backend /api/delivery/my-orders (SMS) failed:', e);
          // continue to try client-side fetch as fallback
        }
      }

      // Livraisons disponibles (payées mais pas encore assignées)
      const { data: availableDeliveries, error: error1 } = await supabase
        .from('orders')
        .select(`
          *,
          products(name, code),
          buyer_profile:profiles!orders_buyer_id_fkey(full_name, phone),
          vendor_profile:profiles!orders_vendor_id_fkey(full_name, phone)
        `)
        .eq('status', 'paid')
        .is('delivery_person_id', null)
        .order('created_at', { ascending: false });

      if (error1) throw error1;

      // Mes livraisons en cours
      const { data: myActiveDeliveries, error: error2 } = await supabase
        .from('orders')
        .select(`
          *,
          products(name, code),
          buyer_profile:profiles!orders_buyer_id_fkey(full_name, phone),
          vendor_profile:profiles!orders_vendor_id_fkey(full_name, phone)
        `)
        .eq('delivery_person_id', user.id)
        .in('status', ['assigned', 'in_delivery', 'delivered', 'cancelled'])
        .order('created_at', { ascending: false });

      if (error2) console.warn('[DeliveryDashboard] myActiveDeliveries supabase error', error2);



      let finalMyDeliveries = (myActiveDeliveries ?? []) as DeliveryOrder[];


      // If the client-side query returned none (likely RLS) or the user uses SMS auth,
      // always try the backend endpoint to fetch this user's deliveries.
      const shouldCallBackend = (!finalMyDeliveries || finalMyDeliveries.length === 0) || Boolean(typeof window !== 'undefined' && localStorage.getItem('sms_auth_session'));
      if (shouldCallBackend && user?.id) {
        try {
          const headers: Record<string,string> = { 'Content-Type': 'application/json' };
          try {
            const sessionResp = await supabase.auth.getSession();
            const token = sessionResp?.data?.session?.access_token ?? null;
            if (token) headers['Authorization'] = `Bearer ${token}`;
          } catch (e) { /* ignore */ }

          // Determine API host similarly to SMS flow (prefer prod when not on localhost)
          const apiHost = (typeof window !== 'undefined' && window.location && !/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname))
            ? (import.meta.env.VITE_API_BASE || 'https://validele.onrender.com')
            : (import.meta.env.VITE_DEV_BACKEND || 'http://localhost:5000');
          const resp = await fetch(`${apiHost}/api/delivery/my-orders`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ deliveryPersonId: user.id })
          });

          let j: unknown = null;
          try {
            const ct = resp.headers.get('content-type') || '';
            if (ct.includes('application/json')) j = await resp.json();
            else j = null;
          } catch (e) {
            console.warn('[DeliveryDashboard] /api/delivery/my-orders parse error', e);
          }

          if (resp.ok && j && typeof j === 'object' && 'orders' in (j as Record<string, unknown>) && Array.isArray((j as { orders?: unknown }).orders)) {
            finalMyDeliveries = (j as { orders: DeliveryOrder[] }).orders;
            // ensure only relevant statuses and dedupe
            finalMyDeliveries = finalMyDeliveries.filter(o => ['assigned','in_delivery','delivered','cancelled'].includes(String(o.status)));
          } else if (!resp.ok) {
            console.warn('[DeliveryDashboard] backend /api/delivery/my-orders returned non-ok', resp.status, j);
          }
        } catch (e) {
          console.warn('[DeliveryDashboard] backend /api/delivery/my-orders failed', e);
          // try remote prod fallback (best-effort)
          try {
            const prodResp = await fetch('https://validele.onrender.com/api/delivery/my-orders', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deliveryPersonId: user.id })
            });
            const prodJson = prodResp.ok ? await prodResp.json().catch(() => null) : null;
            if (prodResp.ok && prodJson && typeof prodJson === 'object' && Array.isArray((prodJson as { orders?: unknown }).orders)) {
              finalMyDeliveries = (prodJson as { orders: DeliveryOrder[] }).orders;
            }
          } catch (e2) { console.warn('[DeliveryDashboard] prod fallback failed', e2); }
        }
      }

      // No local cache: do not load cached deliveries (explicit requirement)

      // Filter to only statuses relevant to a delivery person and dedupe by id
      try {
        const filtered = (finalMyDeliveries || []).filter(o => ['assigned','in_delivery','delivered','cancelled'].includes(String(o.status)));
        const deduped: Record<string, DeliveryOrder> = {};
        for (const o of filtered) deduped[o.id] = o;
        finalMyDeliveries = Object.values(deduped);
        console.log('[DeliveryDashboard] finalMyDeliveries after filter/dedupe:', finalMyDeliveries.length, finalMyDeliveries.map(x => ({ id: x.id, status: x.status })));

      } catch (e) { /* ignore */ }

      setDeliveries((availableDeliveries ?? []) as DeliveryOrder[]);
      // Avoid overwriting a previously-loaded non-empty deliveries list with an empty result from a later failing fetch.
      setMyDeliveries(prev => {
        try {
          const newLen = (finalMyDeliveries || []).length;
          const prevLen = (prev || []).length;
          if (newLen === 0 && prevLen > 0) {
            return prev;
          }
        } catch (e) { /* if anything goes wrong, fall through and set the new value */ }
        return finalMyDeliveries;
      });
    } catch (error) {
      console.error('Erreur lors du chargement des livraisons:', error);
      console.warn('Impossible de charger les livraisons. Vérifiez votre connexion.');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    if (!user?.id) return;
    
    try {
      // Use server endpoint to avoid RLS issues and unify auth handling (SMS or Supabase)
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

      const url = apiUrl(`/api/delivery/transactions?delivery_person_id=${user.id}`);
      const headers: Record<string,string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const resp = await fetch(url, { method: 'GET', headers });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || !json.success) {
        throw new Error((json && json.error) ? String(json.error) : `Backend returned ${resp.status}`);
      }

      const txs = (json.transactions || []) as Array<{id: string; order_id: string; status: string; amount?: number; transaction_type?: string; created_at: string}>;

      // Cache to prevent flicker when backend temporarily returns empty
      const cacheKey = `cached_delivery_transactions_${user.id}`;
      try {
        if (txs.length > 0) {
          localStorage.setItem(cacheKey, JSON.stringify({ transactions: txs, ts: Date.now() }));
          setTransactions(txs);
        } else {
          // Use cached recent transactions (<5min) when server returns empty
          const raw = localStorage.getItem(cacheKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.transactions && (Date.now() - (parsed.ts || 0) < 5 * 60 * 1000)) {
              console.warn('[DeliveryDashboard] backend returned empty transactions — using cached transactions to avoid flicker');
              setTransactions(parsed.transactions);
              // schedule a quick retry
              setTimeout(() => { fetchTransactions(); }, 2000);
            } else {
              setTransactions([]);
            }
          } else {
            setTransactions([]);
          }
        }
      } catch (e) {
        console.warn('[DeliveryDashboard] cache error:', e);
        setTransactions(txs);
      }

    } catch (error) {
      console.error('Erreur lors du chargement des transactions:', error);
    }
  };

  const deliveriesInProgress = myDeliveries.filter(d => d.status === 'in_delivery' || d.status === 'assigned' || d.status === 'cancelled');
  const deliveriesCompleted = myDeliveries.filter(d => d.status === 'delivered');
  const inProgressDeliveries = deliveriesInProgress.length;
  const completedDeliveries = deliveriesCompleted.length;

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        // Use backend admin endpoints for SMS-auth users (no token on client)
        const payload = { profileId: user.id, full_name: editProfile.full_name, phone: editProfile.phone };
        
        const { ok, json, error, url } = await postProfileUpdate(payload);
        
        if (!ok) {
          // Silent server check for robustness (no debug UI message)
          try {
            await getProfileById(user.id);
          } catch (e) {
            // ignore
          }
          toast({ title: 'Erreur', description: 'Impossible de mettre à jour le profil', variant: 'destructive' });
          throw new Error(`Backend update failed: ${JSON.stringify(error)}`);
        }
        const saved = json?.profile ?? json;
        setUserProfile({ full_name: saved?.full_name ?? editProfile.full_name, phone: saved?.phone ?? editProfile.phone });
        try {
          const cachedRaw = localStorage.getItem('auth_cached_profile_v1');
          const cacheObj = cachedRaw ? JSON.parse(cachedRaw) : { id: user.id, email: user.email || '', full_name: editProfile.full_name, phone: editProfile.phone, role: 'delivery' };
          cacheObj.full_name = saved?.full_name ?? editProfile.full_name;
          cacheObj.phone = saved?.phone ?? editProfile.phone;
          localStorage.setItem('auth_cached_profile_v1', JSON.stringify(cacheObj));
        } catch (e) {
          // ignore
        }
        // Also update the sms_auth_session fallback so the UI doesn't revert on reload
        try {
          const smsRaw = localStorage.getItem('sms_auth_session');
          if (smsRaw) {
            try {
              const smsObj = JSON.parse(smsRaw);
              smsObj.fullName = saved?.full_name ?? smsObj.fullName ?? editProfile.full_name;
              smsObj.phone = saved?.phone ?? smsObj.phone ?? editProfile.phone;
              localStorage.setItem('sms_auth_session', JSON.stringify(smsObj));
              console.log('[DEBUG] Updated sms_auth_session after backend profile update');
            } catch (e) {
              console.warn('[DEBUG] failed to update sms_auth_session', e);
            }
          }
        } catch (e) {
          // ignore
        }
        toast({ title: 'Succès', description: 'Profil mis à jour' });
        setIsEditingProfile(false);
      } else {
        console.log('Mise à jour profil pour user:', user.id);
        console.log('Données:', { full_name: editProfile.full_name, phone: editProfile.phone });
        
        const { data, error } = await supabase
          .from('profiles')
          .update({
            full_name: editProfile.full_name,
            phone: editProfile.phone
          })
          .eq('id', user.id)
          .select();

        console.log('Résultat update:', { data, error });

        if (error) {
          console.error('Erreur Supabase:', error);
          throw error;
        }

        toast({
          title: 'Succès',
          description: 'Profil mis à jour avec succès'
        });

        setUserProfile({
          full_name: editProfile.full_name,
          phone: editProfile.phone
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

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleTakeDelivery = async (orderId: string) => {
    if (!user?.id) return;
    setTakingOrderId(orderId);
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          delivery_person_id: user.id,
          status: 'assigned',
          assigned_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .eq('status', 'paid')
        .is('delivery_person_id', null);

      if (error) throw error;

      toast({
        title: 'Commande prise en charge',
        description: 'La livraison a été assignée à votre compte.'
      });

      fetchDeliveries();
    } catch (error) {
      console.error('Erreur lors de la prise en charge:', error);
      toast({
        title: 'Erreur',
        description: toFrenchErrorMessage(error, 'Impossible de prendre la commande'),
        variant: 'destructive'
      });
    } finally {
      setTakingOrderId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'assigned':
      case 'in_delivery':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800"><Truck className="h-3 w-3 mr-1" />En cours</span>;
      case 'delivered':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary"><CheckCircle className="h-3 w-3 mr-1 text-primary" />Livrée</span>;
      case 'cancelled':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Annulée</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  // Démarrer la livraison (passer en 'in_delivery' + SMS)
  const handleStartDelivery = async (delivery: DeliveryOrder) => {
    if (!user?.id) return;
    try {
      const resp = await fetch('/api/orders/mark-in-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: delivery.id, deliveryPersonId: user.id })
      });
      const json = await resp.json();
      if (!resp.ok || !json.success) {
        throw new Error(json?.error || 'Erreur lors du démarrage de la livraison');
      }
      // Immediately show the delivery dashboard 'En cours' section
      navigate('/delivery?tab=in_progress');
      toast({ title: 'Commande récupérée', description: 'Vous êtes redirigé vers vos livraisons en cours. Vous pouvez scanner le QR code du client pour finaliser.' });
      fetchDeliveries();
    } catch (error) {
      toast({ title: 'Erreur', description: toFrenchErrorMessage(error, 'Impossible de démarrer la livraison'), variant: 'destructive' });
    }
  };

  const renderDeliveryCard = (delivery: DeliveryOrder, variant: 'current' | 'completed') => {
    // Trouver les transactions associées à cette livraison
    const payoutTransaction = transactions.find(t => t.order_id === delivery.id && t.transaction_type === 'payout');
    
    return (
      <Card key={delivery.id} className={`border ${variant === 'current' ? 'border-orange-200' : 'border-primary/20'} shadow-sm`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className={`font-mono text-xs px-2 py-0.5 rounded-full ${variant === 'current' ? 'bg-orange-100 text-orange-700' : 'bg-primary/10 text-primary'}`}>
              {delivery.order_code}
            </span>
            {getStatusBadge(delivery.status)}
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            {delivery.products?.name}
          </h3>
          <div className="space-y-1 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-700 text-xs whitespace-nowrap">Client:</span>
              <span className="text-xs text-gray-700">
                {delivery.buyer_profile?.full_name || 'Client'}
              </span>
            </div>
            {delivery.buyer_profile?.phone && (
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-700 text-xs whitespace-nowrap">Téléphone:</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => { setCallTarget(delivery.buyer_profile?.phone || null); setCallModalOpen(true); }}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-[11px] font-medium hover:bg-blue-100 transition"
                      aria-label="Appeler le client"
                    >
                      <PhoneIcon className="h-4 w-4" size={14} />
                      <span className="text-[11px]">Appeler ce client</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Appeler le client</TooltipContent>
                </Tooltip>
              </div>
            )} 

            <p>Adresse : {delivery.buyer_profile?.address || delivery.delivery_address || 'Adresse à définir'}</p>
          </div>
          {/* Affichage du statut de paiement vendeur(se) */}
          {delivery.status === 'delivered' && payoutTransaction && (
            <div className="mt-2 p-2 bg-purple-50 rounded-md">
              <p className="text-xs font-medium text-purple-900">
                💰 Paiement vendeur(se): 
                <span className={`ml-2 px-2 py-0.5 rounded ${
                  payoutTransaction.status === 'SUCCESSFUL' ? 'bg-primary/10 text-primary' :
                  payoutTransaction.status === 'PENDING1' || payoutTransaction.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {payoutTransaction.status === 'SUCCESSFUL' ? '✓ Effectué' :
                   payoutTransaction.status === 'PENDING1' || payoutTransaction.status === 'PENDING' ? '⏳ En cours' :
                   '✗ Échoué'}
                </span>
              </p>
            </div>
          )}
          <div className="mt-3 text-lg font-bold text-primary">
            {delivery.total_amount?.toLocaleString()} FCFA
          </div>
          {variant === 'current' && (
            <div className="mt-4 space-y-2">
              {delivery.status === 'assigned' && (
                <Button
                  className="w-full btn-delivery"
                  onClick={() => handleStartDelivery(delivery)}
                >
                  <Truck className="h-4 w-4 mr-2" />
                  Démarrer la livraison
                </Button>
              )}
              {delivery.status === 'in_delivery' && (
                <Button
                  className="w-full btn-delivery"
                  onClick={() => navigate(`/scanner?orderId=${delivery.id}&orderCode=${encodeURIComponent(String(delivery.order_code || ''))}`)}
                >
                  Scanner Qrcode Client
                </Button>
              )}
            </div>
          )} 
          {variant === 'completed' && (
            <div className="flex items-center gap-2 mt-4 text-primary">
              <CheckCircle className="h-4 w-4" />
              <span className="font-medium text-sm">Livraison terminée</span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };


  // Harmonized Spinner for all main loading states
  // Suppression de l'overlay et du spinner de chargement (plus d'affichage pendant le chargement)

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0 relative">
      {/* Dev diagnostics banner (only in development) */}

      {/* Header Moderne - Style similaire à VendorDashboard */}
      <header className="bg-primary rounded-b-2xl shadow-lg mb-6">
        <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col items-center justify-center">
          <h1 className="text-3xl md:text-4xl font-extrabold text-white drop-shadow-lg text-center tracking-tight">
            Validèl
          </h1>
          <p className="text-white/90 text-sm mt-1">Espace Livreur</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8">

        {/* Navigation - Desktop Tabs */}
        <div className="hidden md:block">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="in_progress" className="flex items-center space-x-2">
                <Truck className="h-4 w-4" />
                <span>En cours ({inProgressDeliveries})</span>
              </TabsTrigger>
              <TabsTrigger value="completed" className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4" />
                <span>Terminées ({completedDeliveries})</span>
              </TabsTrigger>
              <TabsTrigger value="profile" className="flex items-center space-x-2">
                <User className="h-4 w-4" />
                <span>Compte</span>
              </TabsTrigger>
            </TabsList>

            {/* En cours Tab */}
            <TabsContent value="in_progress" className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900">Livraisons en cours</h2>
              <div className="flex justify-center">
                <Link to="/scanner">
                  <Button className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 text-sm rounded-md">
                    <QrCode className="h-4 w-4 mr-2" />
                    Prendre une nouvelle commande
                  </Button>
                </Link>
              </div>

              {deliveriesInProgress.length === 0 ? (
                <Card className="border border-orange-100">
                  <CardContent className="p-8 text-center">
                    <Truck className="h-12 w-12 text-orange-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Aucune livraison en cours</h3>
                    <p className="text-gray-500 mb-4">Scannez un QR code pour prendre en charge une commande</p>

                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {deliveriesInProgress.map(delivery => renderDeliveryCard(delivery, 'current'))}
                </div>
              )}
            </TabsContent>

            {/* Terminées Tab */}
            <TabsContent value="completed" className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900">Livraisons terminées</h2>

              {deliveriesCompleted.length === 0 ? (
                <Card className="border border-green-100">
                  <CardContent className="p-8 text-center">
                    <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Aucune livraison terminée</h3>
                    <p className="text-gray-500">Vos livraisons terminées apparaîtront ici</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {deliveriesCompleted.map(delivery => renderDeliveryCard(delivery, 'completed'))}
                </div>
              )}
            </TabsContent>

            {/* Profile Tab */}
            <TabsContent value="profile" className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900">Mon Compte</h2>
              
              <Card>
                <CardContent className="p-6 space-y-4">
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
                        <label className="text-sm font-medium text-gray-500">Statistiques</label>
                        <div className="grid grid-cols-2 gap-4 mt-2">
                          <div className="bg-primary/10 p-3 rounded-lg">
                            <p className="text-2xl font-bold text-primary">{inProgressDeliveries}</p>
                            <p className="text-sm text-muted-foreground">En cours</p>
                          </div>
                          <div className="bg-primary/10 p-3 rounded-lg">
                            <p className="text-2xl font-bold text-primary">{completedDeliveries}</p>
                            <p className="text-sm text-muted-foreground">Terminées</p>
                          </div>
                        </div>
                      </div>
                      <Button 
                        onClick={() => setIsEditingProfile(true)}
                        className="btn-delivery"
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Modifier le profil
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={handleSignOut}
                        className="w-full mt-2"
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        Déconnexion
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
                      <div className="flex space-x-2">
                        <Button 
                          onClick={handleSaveProfile}
                          disabled={savingProfile}
                          className="btn-delivery"
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
            </TabsContent>
          </Tabs>
        </div>

        {/* Navigation Mobile - Bottom Navigation Bar */}
        <div className="md:hidden">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="pb-20 px-0">
            <div className="space-y-6">
              <TabsContent value="in_progress" className="mt-0">
                <div className="space-y-4">
                  <h2 className="text-base font-semibold">En cours ({inProgressDeliveries})</h2>
                  <div className="flex justify-center">
                    <Link to="/scanner">
                      <Button className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 text-sm rounded-md">
                        <QrCode className="h-4 w-4 mr-1" />
                        Prendre une nouvelle commande
                      </Button>
                    </Link>
                  </div>

                  {deliveriesInProgress.length === 0 ? (
                    <Card className="border border-orange-100">
                      <CardContent className="p-6 text-center">
                        <Truck className="h-10 w-10 text-orange-400 mx-auto mb-3" />
                        <h3 className="font-semibold text-gray-900 mb-2">Aucune livraison</h3>
                        <p className="text-sm text-gray-500 mb-4">Scannez pour prendre une commande</p>

                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-4">
                      {deliveriesInProgress.map(delivery => renderDeliveryCard(delivery, 'current'))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="completed" className="mt-0">
                <div className="space-y-4">
                  <h2 className="text-base font-semibold">Terminées ({completedDeliveries})</h2>

                  {deliveriesCompleted.length === 0 ? (
                    <Card className="border border-green-100">
                      <CardContent className="p-6 text-center">
                        <CheckCircle className="h-10 w-10 text-green-400 mx-auto mb-3" />
                        <h3 className="font-semibold text-gray-900 mb-2">Aucune livraison terminée</h3>
                        <p className="text-sm text-gray-500">Vos livraisons terminées apparaîtront ici</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-4">
                      {deliveriesCompleted.map(delivery => renderDeliveryCard(delivery, 'completed'))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="profile" className="mt-0">
                <div className="space-y-4">
                  <h2 className="text-base font-semibold">Mon Compte</h2>
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
                            <label className="text-sm font-medium text-gray-500">Statistiques</label>
                            <div className="grid grid-cols-2 gap-3 mt-2">
                              <div className="bg-primary/10 p-3 rounded-lg text-center">
                                <p className="text-xl font-bold text-primary">{inProgressDeliveries}</p>
                                <p className="text-xs text-muted-foreground">En cours</p>
                              </div>
                              <div className="bg-primary/10 p-3 rounded-lg text-center">
                                <p className="text-xl font-bold text-primary">{completedDeliveries}</p>
                                <p className="text-xs text-muted-foreground">Terminées</p>
                              </div>
                            </div>
                          </div>
                          <Button 
                            onClick={() => setIsEditingProfile(true)}
                            className="btn-delivery w-full"
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Modifier le profil
                          </Button>
                          <Button 
                            onClick={handleSignOut}
                            variant="destructive"
                            className="w-full mt-2 flex items-center justify-center"
                          >
                            <LogOut className="h-4 w-4 mr-2" />
                            Déconnexion
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
                          <div className="flex space-x-2">
                            <Button 
                              onClick={handleSaveProfile}
                              disabled={savingProfile}
                              className="btn-delivery flex-1"
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
                    value="in_progress" 
                    className="flex flex-col items-center justify-center space-y-1 h-14 w-20 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <Truck className="h-5 w-5" />
                    <span className="text-xs font-medium">En cours</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="completed" 
                    className="flex flex-col items-center justify-center space-y-1 h-14 w-20 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <CheckCircle className="h-5 w-5" />
                    <span className="text-xs font-medium">Terminées</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="profile" 
                    className="flex flex-col items-center justify-center space-y-1 h-14 w-20 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
      <Dialog open={callModalOpen} onOpenChange={setCallModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Appeler ce client ?</DialogTitle>
            <p className="text-sm text-gray-600 mt-2">Numéro: {callTarget}</p>
          </DialogHeader>
          <DialogFooter>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCallModalOpen(false)}>Annuler</Button>
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  if (callTarget) {
                    window.location.href = `tel:${callTarget}`;
                  }
                  setCallModalOpen(false);
                }}
              >
                Appeler
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DeliveryDashboard;
