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
  const isOnline = useNetwork();
  const fetchProfile = useCallback(async () => {
    if (!user) return;

    // If SMS session present, use authUserProfile from useAuth instead of calling Supabase (no token available)
    const smsSessionStr = typeof window !== 'undefined' ? localStorage.getItem('sms_auth_session') : null;
    if (smsSessionStr) {
      
      if (authUserProfile) {
        setUserProfile({
          full_name: authUserProfile.full_name ?? undefined,
          phone: authUserProfile.phone ?? undefined,
          wallet_type: (authUserProfile as any).wallet_type ?? (authUserProfile as any).walletType ?? undefined
        });
        setEditProfile({
          full_name: authUserProfile.full_name ?? '',
          phone: authUserProfile.phone ?? '',
          wallet_type: (authUserProfile as any).wallet_type ?? (authUserProfile as any).walletType ?? ''
        });
      } else {
        setUserProfile(null);
        setEditProfile({ full_name: '', phone: '', wallet_type: '' });
      }
      return;
    }

    const walletColumnMissing = (err: { message?: string } | null) =>
      Boolean(err?.message && (err.message.includes("column") && err.message.includes("wallet")));
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, phone, wallet_type')
        .eq('id', user.id)
        .maybeSingle<ProfileRow>();
      
      let profileData: ProfileRow | null = null;
      if (!error && data) {
        profileData = {
          full_name: (data as any).full_name ?? null,
          phone: (data as any).phone ?? null,
          wallet_type: (data as any).wallet_type ?? null
        };
      }
      if (error && !walletColumnMissing(error)) {
        throw error;
      }
      if (profileData) {
        const fullName = profileData.full_name ?? '';
        const phone = profileData.phone ?? '';
        setUserProfile({ full_name: fullName, phone, wallet_type: profileData.wallet_type ?? undefined });
        setEditProfile(prev => ({
          ...prev,
          full_name: fullName || prev.full_name,
          phone: phone || prev.phone,
          wallet_type: profileData.wallet_type ?? prev.wallet_type ?? ''
        }));
        // Cache sans walletType
        try {
          localStorage.setItem('auth_cached_profile_v1', JSON.stringify({
            id: user.id,
            email: user.email || '',
            full_name: fullName,
            phone,
            role: 'vendor'
          }));
        } catch (e) {
          console.warn('VendorDashboard failed to cache profile', e);
        }
      } else {
        
        // Fallback: try finding the profile by phone or email if available
        try {
          let fallbackRes: any = null;
          if (user?.email) {
            
            fallbackRes = await supabase
              .from('profiles')
              .select('full_name, phone, wallet_type')
              .eq('email', user.email)
              .maybeSingle();
          }
          if ((!fallbackRes || !fallbackRes.data) && user?.phone) {
            
            fallbackRes = await supabase
              .from('profiles')
              .select('full_name, phone, wallet_type')
              .eq('phone', user.phone)
              .maybeSingle();
          }
          
          if (fallbackRes && !fallbackRes.error && fallbackRes.data) {
            const d = fallbackRes.data as any;
            const fullName = d.full_name ?? '';
            const phone = d.phone ?? '';
            setUserProfile({ full_name: fullName, phone, wallet_type: d.wallet_type ?? undefined });
            setEditProfile({ full_name: fullName, phone, wallet_type: d.wallet_type ?? '' });
            try {
              localStorage.setItem('auth_cached_profile_v1', JSON.stringify({ id: user.id, email: user.email || '', full_name: fullName, phone, role: 'vendor' }));
            } catch (e) {
              // ignore
            }
          }
        } catch (e) {
          console.warn('VendorDashboard fetchProfile fallback failed', e);
        }
      }
    } catch (error) {
      console.error('VendorDashboard fetchProfile error', error);
    }
  }, [user, authUserProfile]);
  const fetchProducts = useCallback(async () => {
    if (!user) return;
  
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('vendor_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      // Convertir null en undefined pour compatibilité avec le type Product
      const mappedData = (data || []).map(p => ({
        ...p,
        description: p.description ?? undefined,
        category: p.category ?? undefined,
        image_url: p.image_url ?? undefined,
        stock_quantity: p.stock_quantity ?? undefined,
        is_available: p.is_available ?? true
      })) as Product[];
      setProducts(mappedData);
      try {
        localStorage.setItem(`cached_products_${user.id}`, JSON.stringify(mappedData));
      } catch (e) {
        // ignore cache failures
      }
    } catch (error) {
      // Try to use cached products if offline
      try {
        const cached = localStorage.getItem(`cached_products_${user?.id}`);
        if (cached) {
          const parsed = JSON.parse(cached) as Product[];
          setProducts(parsed);
          toast({ title: 'Hors-ligne', description: 'Affichage des produits en cache' });
          return;
        }
      } catch (e) {
        // ignore
      }
      toast({
        title: "Erreur",
        description: "Impossible de charger les produits",
        variant: 'destructive'
      });
    }
  }, [user, toast]);
  const fetchOrders = useCallback(async () => {
    if (!user) return;
  
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          products(name),
          profiles!orders_buyer_id_fkey(full_name, phone),
          delivery_person:profiles!orders_delivery_person_id_fkey(full_name, phone)
        `)
        .eq('vendor_id', user.id)
        .in('status', ['paid', 'assigned', 'in_delivery', 'delivered']) // Seulement les commandes payées et suivantes
        .order('created_at', { ascending: false });
      if (error) throw error;
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
        // Keep buyer profile phone so callers can display the call button
        profiles: o.profiles ? { full_name: o.profiles.full_name || '', phone: o.profiles.phone ?? undefined } : undefined
      })) as Order[];
      setOrders(mappedOrders.filter(order => order.status !== 'pending'));
    } catch (error) {
      // Try to load cached orders when offline
      try {
        const cached = localStorage.getItem(`cached_orders_${user?.id}`);
        if (cached) {
          const parsed = JSON.parse(cached) as Order[];
          setOrders(parsed);
          toast({ title: 'Hors-ligne', description: 'Affichage des commandes en cache' });
          return;
        }
      } catch (e) {
        // ignore
      }
      toast({
        title: "Erreur",
        description: "Impossible de charger les commandes",
        variant: "destructive",
      });
    }
  }, [user, toast]);
  const fetchTransactions = useCallback(async () => {
    if (!user) return;
  
    try {
      // Récupérer les transactions de paiement (payouts) pour ce vendeur
     
      const { data, error } = await (supabase as any)
        .from('payment_transactions')
        .select(`
          *,
          orders!inner(vendor_id, order_code, buyer_id)
        `)
        .eq('orders.vendor_id', user.id)
        .eq('transaction_type', 'payout')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTransactions(data || []);
      try {
        localStorage.setItem(`cached_transactions_${user.id}`, JSON.stringify(data || []));
      } catch (e) {
        // ignore
      }
    } catch (error) {
      // Try cached transactions
      try {
        const cached = localStorage.getItem(`cached_transactions_${user?.id}`);
        if (cached) {
          const parsed = JSON.parse(cached) as any[];
          setTransactions(parsed as any || []);
          toast({ title: 'Hors-ligne', description: 'Affichage des transactions en cache' });
          return;
        }
      } catch (e) {
        // ignore
      }
      console.error('Erreur lors du chargement des transactions:', error);
    }
  }, [user, toast]);
  // Profile auto-creation logic (like BuyerDashboard)
  useEffect(() => {
    const fetchOrCreateProfile = async () => {
      // If Auth provider already has a complete profile from Supabase,
      // prefer that authoritative profile for UI display/editing.
      // Always fetch from Supabase, never use cached profile for display
      // This ensures the UI always shows backend data
      if (user?.id) {
        // Fetch latest profile from Supabase and populate local edit state
        try {
          await supabase.auth.getSession().catch(() => {});
          await supabase.auth.getUser().catch(() => {});
        } catch (e) {
          // Ignore transient session read errors
        }
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, phone, wallet_type')
          .eq('id', user.id)
          .maybeSingle();
        if (!error && data) {
          // Defensive: check that data is a profile row, not an error object
          if (
            typeof data === 'object' &&
            data !== null &&
            'full_name' in data &&
            'phone' in data &&
            'wallet_type' in data
          ) {
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
          } else {
            // If data is not a valid profile row, log for debug
            console.error('[DEBUG] Unexpected data shape from Supabase', data);
          }
        } else if (error) {
          console.error('[DEBUG] fetchOrCreateProfile error', error);
          // Attempt to create if not found
          if (error.code === 'PGRST116') { // Row not found
            const { error: insertError } = await supabase
              .from('profiles')
              .insert({
                id: user.id,
                full_name: '',
                phone: user.phone || '',
                role: 'vendor'
              });
            if (insertError) {
              console.error('[DEBUG] Profile creation error', insertError);
            } else {
              // Re-fetch after creation
              fetchProfile();
            }
          }
        }
      }
    };
    const fetchData = async () => {
      setPageLoading(true);
      await fetchOrCreateProfile();
      await Promise.all([fetchProfile(), fetchProducts(), fetchOrders(), fetchTransactions()]);
      setPageLoading(false);
    };
    if (user) {
      fetchData();
    }
  }, [user, fetchProfile, fetchProducts, fetchOrders, fetchTransactions]);
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
      toast({ title: 'Erreur', description: (error as any)?.message || 'Impossible de modifier le produit', variant: 'destructive' });
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
  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0 relative">
      {/* Harmonized Spinner for all main loading states */}
      {isPageLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80">
          <Spinner size="xl" className="" hideWhenGlobal={false} />
        </div>
      )}
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
          <h2 className="text-2xl font-bold text-gray-900">Commandes</h2>
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
                      <div className="flex items-center gap-2 mb-1">
                        <span role="img" aria-label="box" className="text-green-600 text-lg">📦</span>
                        <span className="font-bold text-lg text-gray-900">{order.products?.name}</span>
                      </div>
                      <div className="flex items-center mb-1">
                        <span className="text-sm font-semibold text-gray-800 w-40">Code commande :</span>
                        <span className="ml-auto text-base font-mono font-bold text-orange-600" style={{letterSpacing:'1px',fontSize:'18px'}}>{order.order_code || order.id}</span>
                      </div>
                      <div className="flex items-center mb-1">
                        <span className="text-sm font-semibold text-gray-800 w-40">Statut commande :</span>
                        <span className="ml-auto text-xs font-bold text-white" style={{background:'#2563eb',borderRadius:12,padding:'2px 5px',fontSize:'11px',letterSpacing:'1px',textTransform:'capitalize',boxShadow:'0 1px 4px #2563eb22'}}>
                          {order.status && STATUS_LABELS_FR[order.status as keyof typeof STATUS_LABELS_FR] || order.status}
                        </span>
                      </div>
                      <div className="flex items-center text-sm text-gray-800 mb-1">
                        <strong>Client :</strong>
                        <span
                          className="ml-auto font-semibold text-gray-900"
                          style={{ fontSize: "14px" }} // Taille réduite
                        >
                          {order.profiles?.full_name || 'Client'}
                        </span>
                      </div>
                      <div className="flex items-center mb-1">
                        <span className="text-sm text-gray-800 font-semibold">Contact :</span>
                        {order.profiles?.phone && (
                          <span className="ml-auto">
                            <button
                              type="button"
                              onClick={() => {
                                const ph = order.profiles?.phone as string;
                                const nm = order.profiles?.full_name;
                                setCallTarget({ phone: ph, name: nm });
                                setCallModalOpen(true);
                              }}
                              className="flex items-center px-2 py-0.5 rounded-lg"
                              style={{
                                background: "#E3F0FF",
                                color: "#1976D2",
                                fontSize: "12px",
                                fontWeight: 500,
                                minWidth: 0,
                                border: "none",
                                boxShadow: "none",
                                height: 24,
                                lineHeight: "16px"
                              }}
                            >
                              <span
                                style={{
                                  background: "#25D366",
                                  borderRadius: "50%",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: 16,
                                  height: 16,
                                  marginRight: 5,
                                }}
                              >
                                <PhoneIcon className="h-3 w-3 text-white" />
                              </span>
                              <span style={{ marginLeft: 0 }}>Appeler ce client</span>
                            </button>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center text-sm text-gray-800 mb-1">
                        <strong>Adresse :</strong>
                        <span className="ml-auto text-gray-700">Adresse à définir</span>
                      </div>
                      <div className="flex items-center text-sm mb-1">
                        <strong>Prix :</strong>
                        <span className="ml-auto font-bold" style={{ color: "#11B122", fontSize: 22 }}>
                          {order.total_amount ? order.total_amount.toLocaleString() + " FCFA" : "Ex : 50 000"}
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
                  <p className="text-lg">Vendeur</p>
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
                <h2 className="text-lg font-semibold">Commandes ({totalOrders})</h2>
                <div className="grid gap-4">
                  {orders.map((order) => (
                    <Card key={order.id} className="border border-orange-100 bg-[#FFF9F3] rounded-xl shadow-sm">
                      <CardContent className="p-4">
                        {/* Ligne 1 : Icône + nom produit en gras */}
                        <div className="flex items-center gap-2 mb-1">
                          <span role="img" aria-label="box" className="text-green-600 text-lg">📦</span>
                          <span className="font-bold text-lg text-gray-900">{order.products?.name}</span>
                        </div>
                        <div className="flex items-center mb-1">
                          <span className="text-xs font-semibold text-gray-700" style={{background:'#fff',borderRadius:4,padding:'2px 8px',border:'1px solid #e0e0e0',marginRight:8}}>Code commande :</span>
                          <span className="text-base font-mono font-bold text-orange-600" style={{letterSpacing:'1px',fontSize:'18px'}}>{order.order_code || order.id}</span>
                        </div>
                        {/* Ligne 4 : Client */}
                        <div className="flex items-center text-sm text-gray-800 mb-1">
                          <strong>Client :</strong>
                          <span
                            className="ml-auto font-semibold text-gray-900"
                            style={{ fontSize: "14px" }} // Taille réduite
                          >
                            {order.profiles?.full_name || 'Client'}
                          </span>
                        </div>
                        {/* Ligne 5 : Contact avec bouton bleu clair */}
                        <div className="flex items-center mb-1">
                          <span className="text-sm text-gray-800 font-semibold">Contact :</span>
                          {order.profiles?.phone && (
                            <span className="ml-auto">
                              <button
                                type="button"
                                onClick={() => {
                                  const ph = order.profiles?.phone as string;
                                  const nm = order.profiles?.full_name;
                                  setCallTarget({ phone: ph, name: nm });
                                  setCallModalOpen(true);
                                }}
                                className="flex items-center px-2 py-0.5 rounded-lg"
                                style={{
                                  background: "#E3F0FF",
                                  color: "#1976D2",
                                  fontSize: "12px",
                                  fontWeight: 500,
                                  minWidth: 0,
                                  border: "none",
                                  boxShadow: "none",
                                  height: 24,
                                  lineHeight: "16px"
                                }}
                              >
                                <span
                                  style={{
                                    background: "#25D366",
                                    borderRadius: "50%",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: 16,
                                    height: 16,
                                    marginRight: 5,
                                  }}
                                >
                                  <PhoneIcon className="h-3 w-3 text-white" />
                                </span>
                                <span style={{ marginLeft: 0 }}>Appeler ce client</span>
                              </button>
                            </span>
                          )}
                        </div>
                        {/* Ligne 6 : Adresse */}
                        <div className="flex items-center text-sm text-gray-800 mb-1">
                          <strong>Adresse :</strong>
                          <span className="ml-auto text-gray-700">Adresse à définir</span>
                        </div>
                        {/* Ligne 7 : Prix */}
                        <div className="flex items-center text-sm mb-1">
                          <strong>Prix :</strong>
                          <span className="ml-auto font-bold" style={{ color: "#11B122", fontSize: 22 }}>
                            {order.total_amount ? order.total_amount.toLocaleString() + " FCFA" : "Ex : 50 000"}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
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
                          <label className="text-sm font-medium text-gray-500">Email</label>
                          <p className="text-lg">{user?.email}</p>
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