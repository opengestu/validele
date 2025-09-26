/* eslint-disable @typescript-eslint/no-unused-expressions */
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, ShoppingCart, Package, Clock, User, CheckCircle, QrCode, Menu, UserCircle, CreditCard } from 'lucide-react';
import { PaymentForm } from '@/components/PaymentForm';
import { PayDunyaService } from '@/services/paydunya';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Product, Order } from '@/types/database';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiUrl } from '@/lib/api';
import.meta.env;
import waveLogo from '@/assets/wave.png';
import orangeMoneyLogo from '@/assets/orange-money.png';

type PaymentMethod = 'wave' | 'orange_money';

const BuyerDashboard = () => {
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchCode, setSearchCode] = useState('');
  const [searchResult, setSearchResult] = useState<Product | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wave');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [userProfile, setUserProfile] = useState<{ phone: string; full_name?: string } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editProfile, setEditProfile] = useState<{ full_name?: string; phone?: string; email?: string }>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrModalValue, setQrModalValue] = useState('');
  const [selectedQrCode, setSelectedQrCode] = useState<string | null>(null);
  const [purchaseQuantity, setPurchaseQuantity] = useState(1);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [payDunyaService] = useState(new PayDunyaService());
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

  const fetchOrders = useCallback(async () => {
    if (!user) return;
    
    setOrdersLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          products(name),
          profiles!orders_vendor_id_fkey(full_name)
        `)
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50); // Limite augmentée pour debug

      if (error) throw error;
      setOrders(data || []);
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

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

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
        phone: userProfile.phone || '',
        email: user.email || ''
      });
    }
  }, [userProfile, user]);

  useEffect(() => {
    const channel = supabase
      .channel('orders-changes-buyer')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
        fetchOrders();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders]);

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
        .eq('code', searchCode.trim().toLowerCase())
        .eq('is_available', true)
        .single();

      if (error) throw error;

      setSearchResult(data);
      toast({
        title: "Produit trouvé",
        description: `${data.name} - ${data.price.toLocaleString()} FCFA`,
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

  // Génère un code de commande unique CMD0001, CMD0002, ...
  const generateOrderCode = async () => {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('order_code')
      .order('created_at', { ascending: true });
    let nextNumber = 1;
    if (orders && orders.length > 0) {
      const max = orders.reduce((acc, o) => {
        const match = o.order_code && o.order_code.match(/^CMD(\d{4})$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          return num > acc ? num : acc;
        }
        return acc;
      }, 0);
      nextNumber = max + 1;
    }
    if (nextNumber > 9999) throw new Error('Limite de 9999 commandes atteinte');
    return `CMD${nextNumber.toString().padStart(4, '0')}`.toUpperCase();
  };

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
    // Update email if changed
    let emailError = null;
    if (editProfile.email && editProfile.email !== user.email) {
      const { error: emailUpdateError } = await supabase.auth.updateUser({ email: editProfile.email });
      emailError = emailUpdateError;
    }
    setSavingProfile(false);
    if (!profileError && !emailError) {
      toast({ title: 'Profil mis à jour', description: 'Vos informations ont été enregistrées.' });
      setDrawerOpen(false);
      setIsEditing(false);
      // Recharger le profil
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setUserProfile(data);
    } else {
      toast({ title: 'Erreur', description: (profileError?.message || emailError?.message), variant: 'destructive' });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const [showAllOrders, setShowAllOrders] = useState(false);
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
    try {
      setProcessingPayment(true);
      const response = await fetch(apiUrl('/api/payments/create-order-and-invoice'), {
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
      });
      const data = await response.json();
      if (!response.ok || data.status !== 'success' || !data.token) {
        throw new Error(data?.message || 'Erreur serveur PayDunya');
      }
      setPendingOrderToken(data.token || null);
      setReceiptUrl(data.receipt_url || null);
      setOrderId(data.order_id || null);
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
        const res = await fetch(apiUrl('/api/payments/softpay/wave'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName, email, phone, payment_token: data.token })
        });
        const result = await res.json();
        if (result.success && result.url) {
          window.location.href = result.url;
        } else {
          throw new Error(result.message || 'Erreur paiement Wave');
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
            const res = await fetch(apiUrl('/api/payments/softpay/orange'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                customer_name: fullName,
                customer_email: email,
                phone_number: phone,
                invoice_token: data.token,
                api_type: 'QRCODE'
              })
            });
            const result = await res.json();
            if (result.success && result.url) {
              window.location.href = result.url;
            } else {
              throw new Error(result.message || 'Erreur paiement Orange Money QR');
            }
          } else {
            // OTP : afficher mini-formulaire OTP
            setPendingOtpInfo({ fullName, email, phone, token: data.token });
            setShowOtpForm(true);
          }
        });
        return;
      }
    } catch (error) {
      const err = error as Error;
      toast({
        title: 'Erreur',
        description: err.message || 'Erreur lors de la création de la commande',
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
      const err = error as Error;
      toast({
        title: 'Erreur',
        description: err.message || 'Erreur lors du paiement',
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
      case 'paid': return 'Payée';
      case 'in_delivery': return 'En livraison';
      case 'delivered': return 'Livrée';
      case 'cancelled': return 'Annulée';
      default: return status;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Acheteur moderne - dégradé vert-bleu avec avatar desktop & mobile */}
      <header className="bg-gradient-to-r from-green-500 to-blue-400 rounded-b-2xl shadow-lg mb-6 relative">
        <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col items-center justify-center">
          <h1 className="text-3xl md:text-4xl font-extrabold text-white drop-shadow-lg text-center tracking-tight">
            Validèl
          </h1>
        </div>
        {/* Avatar desktop */}
        <button
          className="hidden md:flex absolute top-6 right-8 items-center justify-center w-12 h-12 rounded-full bg-white bg-opacity-80 hover:bg-opacity-100 shadow-lg border border-gray-200"
          onClick={() => { setDrawerOpen(true); setIsEditing(true); }}
          aria-label="Profil"
        >
          <UserCircle className="h-8 w-8 text-blue-500" />
        </button>
        {/* Hamburger mobile à gauche */}
        <button
          className="md:hidden absolute top-6 left-6 flex items-center justify-center w-10 h-10 rounded-full bg-white bg-opacity-80 hover:bg-opacity-100 shadow-lg border border-gray-200"
          onClick={() => { setDrawerOpen(true); setIsEditing(true); }}
          aria-label="Menu"
        >
          <Menu className="h-7 w-7 text-blue-500" />
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
              <input
                className="border rounded px-3 py-2"
                name="email"
                placeholder="Email"
                type="email"
                value={editProfile.email || ''}
                onChange={e => setEditProfile(p => ({ ...p, email: e.target.value }))}
                required
              />
              <div className="flex gap-2 mt-4">
                <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={savingProfile}>
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
              <UserCircle className="h-12 w-12 text-blue-500 mb-2" />
              <span className="font-bold text-lg">Mon profil</span>
              <span className="text-base text-gray-700 font-semibold">{userProfile?.full_name || user?.email}</span>
              <span className="text-sm text-gray-500">{user?.email}</span>
              <span className="text-sm text-gray-500">{userProfile?.phone}</span>
            </div>
            <Button
              type="button"
              className="w-full mt-2 bg-red-600 hover:bg-red-700"
              onClick={handleSignOut}
            >
              Déconnexion
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full mt-2"
              onClick={() => { setDrawerOpen(false); setIsEditing(false); }}
            >
              Fermer
            </Button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Colonne de gauche - Recherche et produit */}
          <div className="lg:col-span-2 space-y-6">
            {/* Recherche de produit */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Search className="h-5 w-5 text-gray-500" />
                  <span>Rechercher un produit</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
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
                        <p className="text-sm text-gray-500">Vendeur: {searchResult.profiles?.full_name || searchResult.profiles?.company_name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-blue-600">{searchResult.price.toLocaleString()} FCFA</p>
                        <p className="text-sm text-gray-500">Code: {searchResult.code}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <label className="text-sm font-medium">Quantité:</label>
                      <Input
                        type="number"
                        min="1"
                        value={purchaseQuantity}
                        onChange={(e) => setPurchaseQuantity(parseInt(e.target.value) || 1)}
                        className="w-20"
                      />
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

                    {/* Bouton de paiement */}
                    {paymentMethod === 'wave' && (
                      <Button 
                        onClick={handleCreateOrderAndShowPayment}
                        disabled={processingPayment}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        {processingPayment ? "Traitement..." : "Payer avec Wave"}
                      </Button>
                    )}
                    {paymentMethod === 'orange_money' && (
                      <Button
                        onClick={handleCreateOrderAndShowPayment}
                        disabled={processingPayment}
                        className="w-full bg-orange-600 hover:bg-orange-700"
                      >
                        {processingPayment ? "Traitement..." : "Payer avec Orange Money"}
                      </Button>
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
                {ordersLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  </div>
                ) : orders.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Aucune commande pour le moment</p>
                ) : (
                  <div className="space-y-3">
                    {(showAllOrders
                      ? orders.filter(order => order.status !== 'pending')
                      : orders.filter(order => order.status !== 'pending').slice(0, 5)
                    ).map((order) => (
                      <div key={order.id} className="order-card">
                        <div>
                          <b>{order.products?.name}</b> <span>{order.total_amount} FCFA</span>
                          <span style={{marginLeft: 8, color: '#888'}}>Statut: {getStatusTextFr(order.status)}</span>
                        </div>
                        {/* Bouton pour voir le QR code */}
                        <div style={{ margin: '8px 0' }}>
                          {order.qr_code ? (
                            <button
                              style={{ fontSize: '0.9em', color: '#ff9800', border: '1px solid #ff9800', borderRadius: 4, padding: '2px 10px', background: 'white', cursor: 'pointer' }}
                              onClick={() => { setQrModalValue(order.qr_code); setQrModalOpen(true); }}
                            >
                              Voir QR code
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.8em', color: '#888' }}>QR code indisponible</span>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{order.total_amount?.toLocaleString()} FCFA</p>
                          <p className="text-xs text-gray-500">
                            {order.status === 'paid' && (
                              <span style={{ color: '#ff9800', fontSize: '0.85em', fontWeight: 500 }}>payée</span>
                            )}
                            {order.status === 'in_delivery' && (
                              <span style={{ color: '#2196f3', fontSize: '0.85em', fontWeight: 500 }}>en livraison</span>
                            )}
                            {order.status === 'delivered' && (
                              <span style={{ color: '#4caf50', fontSize: '0.85em', fontWeight: 500 }}>livrée</span>
                            )}
                            {['paid', 'in_delivery', 'delivered'].indexOf(order.status) === -1 && (
                              <span>{order.status}</span>
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                    {!showAllOrders && orders.filter(order => order.status !== 'pending').length > 5 && (
                      <Button variant="outline" size="sm" className="w-full" onClick={() => setShowAllOrders(true)}>
                        Voir toutes les commandes
                      </Button>
                    )}
                  </div>
                )}
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
      {showDirectPaymentForm && paydunyaMode === 'sandbox' && (
        <Dialog open={showDirectPaymentForm} onOpenChange={setShowDirectPaymentForm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Paiement sécurisé</DialogTitle>
            </DialogHeader>
            <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
              <b>Mode test PayDunya :</b> Utilisez les identifiants de test ci-dessous pour simuler un paiement.<br />
              <b>Numéro :</b> 97403627<br />
              <b>Email :</b> marnel.gnacadja@paydunya.com<br />
              <b>Mot de passe/code secret :</b> Miliey@2121
            </div>
            <form id="direct-payment-form" onSubmit={async (e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const phone = (form.elements.namedItem('phone') as HTMLInputElement).value;
              const password = (form.elements.namedItem('password') as HTMLInputElement).value;
              const email = (form.elements.namedItem('email') as HTMLInputElement).value;
              await handleDirectPayment(phone, password, email);
            }} className="space-y-4">
              <Input name="email" type="email" placeholder="Email PayDunya" required defaultValue="marnel.gnacadja@paydunya.com" />
              <Input name="phone" type="tel" placeholder="Numéro de téléphone" required defaultValue="97403627" />
              <Input name="password" type="password" placeholder="Code secret/OTP" required defaultValue="Miliey@2121" />
              <Button type="submit" className="w-full" disabled={processingPayment}>
                {processingPayment ? 'Paiement en cours...' : 'Valider le paiement'}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => {
                const form = document.getElementById('direct-payment-form') as HTMLFormElement;
                if (form) {
                  (form.elements.namedItem('email') as HTMLInputElement).value = 'marnel.gnacadja@paydunya.com';
                  (form.elements.namedItem('phone') as HTMLInputElement).value = '97403627';
                  (form.elements.namedItem('password') as HTMLInputElement).value = 'Miliey@2121';
                }
              }}>
                Remplir avec les identifiants de test
              </Button>
            </form>
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
                      window.open(data.url, '_blank');
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
                      window.open(data.url, '_blank');
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
              <Button className="w-full bg-orange-600 hover:bg-orange-700" onClick={() => onOrangeChoice && onOrangeChoice('qr')}>
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
    </div>
  );
};

export default BuyerDashboard;
