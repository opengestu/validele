/* eslint-disable @typescript-eslint/no-unused-expressions */
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, ShoppingCart, Package, Clock, User, CheckCircle, QrCode, UserCircle, CreditCard, Minus, Plus, Settings, XCircle, AlertTriangle } from 'lucide-react';
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
import { API_BASE, apiUrl } from '@/lib/api';
import { toFrenchErrorMessage } from '@/lib/errors';
import { Spinner } from '@/components/ui/spinner';
import.meta.env;
import waveLogo from '@/assets/wave.png';
import orangeMoneyLogo from '@/assets/orange-money.png';

// Fonction utilitaire pour fetch avec timeout (générique TypeScript)
async function fetchJsonWithTimeout<T = unknown>(url: string, init: RequestInit, timeoutMs: number): Promise<{ res: Response; data: T }> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const data = await res.json();
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

const BuyerDashboard = () => {
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchCode, setSearchCode] = useState('');
  const [searchResult, setSearchResult] = useState<Product | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<Array<{id: string; order_id: string; status: string; amount?: number; transaction_type?: string; created_at: string}>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wave');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [userProfile, setUserProfile] = useState<{ phone: string; full_name?: string } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editProfile, setEditProfile] = useState<{ full_name?: string; phone?: string }>({});
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
  const fetchOrders = useCallback(async () => {
    if (!user) return;
    setOrdersLoading(true);
    try {
      // Get session token from Supabase client to call server endpoint
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || null;
      const res = await fetch(apiUrl('/api/orders/mine'), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      const body = await res.json();
      if (!res.ok || !body || !body.success) throw new Error(body?.error || 'Failed to fetch orders');
      const data = body.orders || [];

      // Filtrer côté client pour n'afficher que les commandes payées, en livraison, livrées, remboursées ou annulées
      const allowedStatus = ['paid', 'in_delivery', 'delivered', 'refunded', 'cancelled'];
      const normalizedOrders = (data || [])
        .filter((o) => typeof o.status === 'string' && allowedStatus.includes(o.status))
        .map((o) => ({
          ...o,
          delivery_person_id: o.delivery_person_id ?? undefined,
          assigned_at: o.assigned_at ?? undefined,
          delivered_at: o.delivered_at ?? undefined,
        })) as Order[];
      setOrders(normalizedOrders);
    } catch (error) {
      console.error('Erreur lors du chargement des commandes:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les commandes",
        variant: "destructive",
      });
    } finally {
      setOrdersLoading(false);
    }
  }, [user, toast]);


  const fetchTransactions = useCallback(async () => {
    if (!user) return;

    try {
      // Get session token from Supabase client to call server endpoint
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || null;

      const res = await fetch(apiUrl('/api/transactions/mine'), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      const body = await res.json();
      if (!res.ok || !body || !body.success) throw new Error(body?.error || 'Failed to fetch transactions');

      setTransactions((body.transactions || []) as Array<{id: string; order_id: string; status: string; amount?: number; transaction_type?: string; created_at: string}>);
    } catch (error) {
      console.error('Erreur lors du chargement des transactions:', error);
    }
  }, [user]);

  useEffect(() => {
    fetchOrders();
    fetchTransactions();
  }, [fetchOrders, fetchTransactions]);

  // Listener pour rafraîchir les commandes quand l'utilisateur revient du navigateur de paiement
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const setupBrowserListener = async () => {
      const listener = await Browser.addListener('browserFinished', () => {
        console.log('[BuyerDashboard] Utilisateur revenu du paiement, rafraîchissement...');
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

  useEffect(() => {
    const fetchProfile = async () => {
      if (user?.id) {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('id', user.id)
          .single();
        if (!error) setUserProfile({
          full_name: data?.full_name || '',
          phone: data?.phone || ''
        });
      }
    };
    fetchProfile();
  }, [user]);

  useEffect(() => {
    if (userProfile && user) {
      setEditProfile({
        full_name: userProfile.full_name || '',
        phone: userProfile.phone || ''
      });
    }
  }, [userProfile, user]);

  useEffect(() => {
    const channel = supabase
      .channel('orders-changes-buyer')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
        console.log('BuyerDashboard: Changement orders détecté', payload);
        fetchOrders();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_transactions' }, payload => {
        console.log('BuyerDashboard: Changement transactions détecté', payload);
        fetchTransactions();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders, fetchTransactions]);

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
      toast({
        title: "Produit trouvé",
        description: `${normalizedProduct.name} - ${normalizedProduct.price.toLocaleString()} FCFA`,
      });
    } catch (error) {
      setSearchResult(null);
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
    const maxAttempts = 30; // 30 x 2s = 1 minute
    const interval = setInterval(async () => {
      attempts++;
      const { data: order, error } = await supabase
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();
      if (order?.status === 'paid') {
        clearInterval(interval);
        navigate(`/payment-success?order_id=${orderId}`);
      }
      if (attempts >= maxAttempts) {
        clearInterval(interval);
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

  const handleSaveProfile = async () => {
    if (!user) {
      toast({ title: 'Erreur', description: "Vous n'êtes pas connecté.", variant: 'destructive' });
      return;
    }
    setSavingProfile(true);
    // Update profile
    const updates: { full_name?: string; phone?: string } = {
      full_name: editProfile.full_name,
      phone: editProfile.phone
    };
    const { error: profileError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);
    setSavingProfile(false);
    if (!profileError) {
      toast({ title: 'Profil mis à jour', description: 'Vos informations ont été enregistrées.' });
      setDrawerOpen(false);
      setIsEditing(false);
      // Recharger le profil
      const { data } = await supabase.from('profiles').select('full_name, phone').eq('id', user.id).single();
      setUserProfile(data ? { phone: data.phone ?? '', full_name: data.full_name ?? undefined } : null);
    } else {
      toast({ title: 'Erreur', description: profileError?.message || 'Erreur inconnue', variant: 'destructive' });
    }
  };

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
              delivery_address: 'Adresse à définir',
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
            title: 'Paiement Orange Money',
            description: 'Validez le paiement sur la page qui s\'est ouverte',
          });
          
          // Retourner à la recherche
          setSearchResult(null);
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
              delivery_address: 'Adresse à définir',
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
            title: 'Paiement Wave',
            description: waveResult.message || 'Validez le paiement dans l\'application Wave',
          });
          
          // Retourner à la recherche
          setSearchResult(null);
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
            delivery_address: 'Adresse à définir',
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
      const data = await response.json();
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

  // Ajout de la fonction de traduction du statut
  const getStatusTextFr = (status: string) => {
    switch (status) {
      case 'pending': return 'En attente';
      case 'paid': return 'Payé';
      case 'in_delivery': return 'En cours de livraison';
      case 'delivered': return 'Livré';
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
    else if (status === 'delivered') { bg = 'bg-green-100 text-green-700'; dot = 'bg-green-500'; }
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
      
      const response = await fetch(apiUrl('/api/payment/pixpay/refund'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: refundOrder.id,
          reason: refundReason || 'Non satisfaction client'
        }),
      });

      const result = await response.json();
      console.log('[REFUND] Résultat:', result);

      if (result.success) {
        toast({
          title: "✅ Remboursement initié",
          description: result.message || `Remboursement de ${refundOrder.total_amount} FCFA en cours`,
          duration: 6000,
        });
        
        // Fermer le modal et rafraîchir les commandes
        setShowRefundModal(false);
        setRefundOrder(null);
        setRefundReason('');
        fetchOrders();
        fetchTransactions();
      } else {
        throw new Error(result.error || 'Erreur lors du remboursement');
      }
    } catch (error) {
      console.error('[REFUND] Erreur:', error);
      toast({
        title: "❌ Échec du remboursement",
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
      {/* Overlay plein écran pendant le paiement */}
      {processingPayment && (
        <div className="fixed inset-0 z-[100] bg-white bg-opacity-95 flex items-center justify-center">
          <Spinner size="xl" />
        </div>
      )}

      {/* Header Client moderne - dégradé orange Validèl */}
      <header className="bg-gradient-to-r from-green-500 to-green-600 rounded-b-2xl shadow-lg mb-6 relative">
        <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col items-center justify-center">
          <h1 className="text-3xl md:text-4xl font-extrabold text-white drop-shadow-lg text-center tracking-tight">
            Validèl
          </h1>
          <p className="text-white/90 text-sm mt-1">Espace Client</p>
        </div>
        {/* Avatar desktop */}
        <button
          className="hidden md:flex absolute top-6 right-8 items-center justify-center w-10 h-10 rounded-full hover:bg-white/10"
          onClick={() => { setDrawerOpen(true); setIsEditing(true); }}
          aria-label="Paramètres"
        >
          <Settings className="h-5 w-5 text-white" />
        </button>
        {/* Hamburger mobile à gauche */}
        <button
          className="md:hidden absolute top-6 left-6 flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/10"
          onClick={() => { setDrawerOpen(true); setIsEditing(true); }}
          aria-label="Paramètres"
        >
          <Settings className="h-5 w-5 text-white" />
        </button>
      </header>

      {/* Drawer desktop */}
      {drawerOpen && (
        <div className="hidden md:flex fixed inset-0 z-50 bg-black bg-opacity-30 justify-end">
          <div className="bg-white w-full max-w-sm h-full shadow-lg p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-6">
              <UserCircle className="h-10 w-10 text-gray-400" />
              <span className="font-bold text-lg">Mon profil</span>
            </div>
            <form className="flex flex-col gap-4 flex-1" onSubmit={async (e) => {
              e.preventDefault();
              await handleSaveProfile();
            }}>
              <input
                className="border rounded px-3 py-2"
                name="full_name"
                placeholder="Nom complet"
                value={editProfile.full_name || ''}
                onChange={e => setEditProfile(p => ({ ...p, full_name: e.target.value }))}
                maxLength={40}
                required
              />
              <input
                className="border rounded px-3 py-2"
                name="phone"
                placeholder="Téléphone"
                value={editProfile.phone || ''}
                onChange={e => setEditProfile(p => ({ ...p, phone: e.target.value }))}
                required
              />
              <div className="flex gap-2 mt-4">
                <Button type="submit" className="flex-1 bg-green-500 hover:bg-green-600" disabled={savingProfile}>
                  {savingProfile ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
                <Button type="button" variant="outline" className="flex-1" onClick={() => { setDrawerOpen(false); setIsEditing(false); }}>
                  Annuler
                </Button>
              </div>
              <Button
                type="button"
                className="w-full mt-2 bg-red-600 hover:bg-red-700"
                onClick={handleSignOut}
              >
                Déconnexion
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Drawer mobile */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black bg-opacity-40 flex justify-end">
          <div className="bg-white w-full max-w-xs h-full shadow-lg p-6 flex flex-col">
            <div className="flex flex-col items-center gap-2 mb-6">
              <UserCircle className="h-12 w-12 text-green-500 mb-2" />
              <span className="font-bold text-lg">Mon profil</span>
            </div>
            <form className="flex flex-col gap-3 flex-1" onSubmit={async (e) => { e.preventDefault(); await handleSaveProfile(); }}>
              <input
                className="border rounded px-3 py-2 text-sm"
                name="full_name"
                placeholder="Nom complet"
                value={editProfile.full_name || ''}
                onChange={e => setEditProfile(p => ({ ...p, full_name: e.target.value }))}
                maxLength={40}
                required
              />
              <input
                className="border rounded px-3 py-2 text-sm"
                name="phone"
                placeholder="Téléphone"
                value={editProfile.phone || ''}
                onChange={e => setEditProfile(p => ({ ...p, phone: e.target.value }))}
                required
              />
              <div className="flex gap-2 mt-2">
                <Button type="submit" className="flex-1 bg-green-500 hover:bg-green-600" disabled={savingProfile}>
                  {savingProfile ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
                <Button type="button" variant="outline" className="flex-1" onClick={() => { setDrawerOpen(false); setIsEditing(false); }}>
                  Annuler
                </Button>
              </div>
              <Button
                type="button"
                className="w-full mt-2 bg-red-600 hover:bg-red-700"
                onClick={handleSignOut}
              >
                Déconnexion
              </Button>
            </form>
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
                    {searchLoading ? '...' : 'Rechercher'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Résultat de recherche */}
            {searchResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Package className="h-5 w-5" />
                    <span>Produit trouvé</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-semibold">{searchResult.name}</h3>
                        <p className="text-gray-600">{searchResult.description}</p>
                        <p className="text-sm text-gray-500">Vendeur(se): {searchResult.profiles?.full_name || searchResult.profiles?.company_name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-green-600">{searchResult.price.toLocaleString()} FCFA</p>
                        <p className="text-sm text-gray-500">Code: {searchResult.code}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <label className="text-sm font-medium">Quantité:</label>
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
                          className="w-24 h-10 text-center"
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
                      <p className="text-lg font-semibold">
                        Total: {(searchResult.price * purchaseQuantity).toLocaleString()} FCFA
                      </p>
                    </div>

                    {/* Sélecteur de moyen de paiement */}
                    <div className="mb-2">
                      <Select value={paymentMethod} onValueChange={v => setPaymentMethod(v as PaymentMethod)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choisir un moyen de paiement" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="wave">
                            <span className="flex items-center gap-3">
                              <img src={waveLogo} alt="Wave" style={{ height: 40, width: 40, objectFit: 'contain', borderRadius: 8, background: '#fff' }} />
                              <span className="text-lg font-bold">Wave</span>
                            </span>
                          </SelectItem>
                          <SelectItem value="orange_money">
                            <span className="flex items-center gap-3">
                              <img src={orangeMoneyLogo} alt="Orange Money" style={{ height: 40, width: 40, objectFit: 'contain', borderRadius: 8, background: '#fff' }} />
                              <span className="text-lg font-bold">Orange Money</span>
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Indicateur de connexion serveur - masqué pour UX plus fluide */}
                    {/* Le warm-up se fait en arrière-plan */}

                    {/* Bouton de paiement */}
                    {paymentMethod === 'wave' && (
                      <>
                        <Button 
                          onClick={handleCreateOrderAndShowPayment}
                          disabled={processingPayment}
                          className="w-full bg-green-500 hover:bg-green-600"
                        >
                          Payer avec Wave
                        </Button>
                        <button
                          type="button"
                          className="w-full mt-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                          onClick={() => { setSearchResult(null); setPurchaseQuantity(1); setPaymentMethod('wave'); setSearchCode(''); }}
                        >
                          Annuler
                        </button>
                      </>
                    )}
                    {paymentMethod === 'orange_money' && (
                      <>
                        <Button
                          onClick={handleCreateOrderAndShowPayment}
                          disabled={processingPayment}
                          className="w-full bg-green-600 hover:bg-orange-700"
                        >
                          Payer avec Orange Money
                        </Button>
                        <button
                          type="button"
                          className="w-full mt-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                          onClick={() => { setSearchResult(null); setPurchaseQuantity(1); setPaymentMethod('wave'); setSearchCode(''); }}
                        >
                          Annuler
                        </button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Colonne de droite - Commandes récentes */}
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
                    <div className="space-y-3">
                      {displayedOrders.map((order) => {
                        // Trouver les transactions associées à cette commande (cacher les payouts côté client)
                        const orderTransactions = transactions.filter(t => t.order_id === order.id);
                        const paymentTransaction = orderTransactions.find(t => t.transaction_type !== 'payout');
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
                        <div key={order.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md w-full">
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-gray-900 break-words text-sm max-w-[220px] xs:max-w-[260px] sm:max-w-none truncate">
                                    {order.products?.name || 'Commande'}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-green-600">
                                      {order.total_amount?.toLocaleString()} FCFA
                                    </span>
                                  </div>
                                </div>
                                <div className="mt-2 space-y-1 text-sm text-gray-600">
                                  <div className="flex flex-col gap-2 pb-2">
                                    <div className="flex items-center gap-3">
                                      <span className="font-medium text-gray-700 text-xs whitespace-nowrap">Vendeur(se):</span>
                                      <span className="flex-1 min-w-0 truncate text-xs">{order.profiles?.full_name || 'N/A'}</span>
                                    </div>
                                    {order.profiles?.phone && (
                                      <div className="flex items-center gap-3 text-sm">
                                        <span className="font-medium text-gray-700 text-xs whitespace-nowrap">Contacts:</span>
                                        <div className="flex items-center gap-2">
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <a
                                                href={`tel:${order.profiles.phone}`}
                                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-[11px] font-medium hover:bg-blue-100 transition min-w-[56px]"
                                                aria-label="Appeler le vendeur(se)"
                                              >
                                                <PhoneIcon className="h-4 w-4" size={14} />
                                                <span className="ml-1 text-[11px] leading-tight">Appeler</span>
                                              </a>
                                            </TooltipTrigger>
                                            <TooltipContent>Appeler le vendeur(se)</TooltipContent>
                                          </Tooltip>

                                          <a
                                            href={`https://wa.me/${order.profiles.phone.replace(/^\+/, '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-50 text-green-700 text-[11px] font-medium hover:bg-green-100 transition min-w-[56px]"
                                            title="Contacter sur WhatsApp"
                                          >
                                            <WhatsAppIcon className="h-4 w-4" size={14} />
                                            <span className="ml-1 text-[11px] leading-tight">WhatsApp</span>
                                          </a>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  {order.delivery_person && (
                                    <div className="flex flex-col gap-1 mt-3">
                                      <div className="flex items-center gap-3">
                                        <span className="font-medium text-gray-700 text-xs whitespace-nowrap">Livreur:</span>
                                        <span className="flex-1 min-w-0 truncate text-xs">{order.delivery_person.full_name}</span>
                                      </div>
                                      {order.delivery_person.phone && (
                                        <div className="flex items-center gap-3 text-sm">
                                          <span className="font-medium text-gray-700 text-xs whitespace-nowrap">Contacts:</span>
                                          <div className="flex items-center gap-2">
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <a
                                                  href={`tel:${order.delivery_person.phone}`}
                                                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-[11px] font-medium hover:bg-blue-100 transition min-w-[56px]"
                                                  aria-label="Appeler le livreur"
                                                >
                                                  <PhoneIcon className="h-4 w-4" size={14} />
                                                  <span className="ml-1 text-[11px] leading-tight">Appeler</span>
                                                </a>
                                              </TooltipTrigger>
                                              <TooltipContent>Appeler le livreur</TooltipContent>
                                            </Tooltip>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>





                            {/* Affichage du remboursement si existant */}
                            {order.status === 'cancelled' && orderTransactions.find(t => t.transaction_type === 'refund') && (
                              <div className="rounded-md bg-orange-50 p-2">
                                <p className="text-xs font-medium text-orange-700">
                                  💸 Remboursement:
                                  <span
                                    className={
                                      `ml-2 inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ` +
                                      (orderTransactions.find(t => t.transaction_type === 'refund')?.status === 'SUCCESSFUL'
                                        ? 'bg-green-100 text-green-700'
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

                            <div className="text-sm flex items-center gap-2">
                              {renderStatusBadge(order.status)}
                            </div>

                            {/* Boutons d'action */}
                            <div className="flex flex-wrap gap-2">
                              {order.qr_code ? (
                                <button
                                  className="rounded-md border border-orange-400 px-3 py-1 text-sm font-medium text-orange-600 hover:bg-orange-50"
                                  onClick={() => { setQrModalValue(order.qr_code ?? ''); setQrModalOpen(true); }}
                                >
                                  Voir QR code
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400">QR code indisponible</span>
                              )}
                              <button
                                className="rounded-md border border-blue-500 px-3 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50"
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
                                    className="flex items-center gap-1 rounded-md border border-red-500 px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
                                    onClick={() => openRefundModal(order)}
                                  >
                                    <XCircle size={14} />
                                    Annuler / Remboursement
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Suppression du doublon prix/statut */}
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
          <div style={{ background: 'white', borderRadius: 12, padding: 32, boxShadow: '0 4px 24px #0002', textAlign: 'center', minWidth: 220 }}>
            <h3 style={{ marginBottom: 16 }}>QR Code de la commande</h3>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrModalValue)}`} alt="QR Code" />
            {/* Bouton Ouvrir PayDunya supprimé */}
            <div style={{ marginTop: 24 }}>
              <button onClick={() => setQrModalOpen(false)} style={{ padding: '6px 18px', borderRadius: 6, background: '#ff9800', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Fermer</button>
            </div>
          </div>
        </div>
      )}
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
                <Input name="phone" type="tel" placeholder="Téléphone" required defaultValue={userProfile?.phone || ''} />
                {softPayType === 'orange_otp' && (
                  <Input name="otp" placeholder="Code OTP Orange Money" required />
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
              <Button className="w-full bg-green-600 hover:bg-orange-700" onClick={() => onOrangeChoice && onOrangeChoice('qr')}>
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
              <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>⚠️ Attention:</strong> Cette action est irréversible. Le montant sera remboursé sur votre compte 
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
                      Confirmer le remboursement
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
    </div>
  );
};

export default BuyerDashboard;
