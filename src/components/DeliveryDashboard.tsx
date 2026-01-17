/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Truck, QrCode, Package, CheckCircle, User, LogOut, Edit } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
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
  buyer_profile?: { full_name?: string | null; phone?: string | null } | null;
  vendor_profile?: { full_name?: string | null; phone?: string | null } | null;
  delivery_address?: string | null;
  buyer_phone?: string | null;
  total_amount?: number | null;
};

const DeliveryDashboard = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [userProfile, setUserProfile] = useState<ProfileRow | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
  const [myDeliveries, setMyDeliveries] = useState<DeliveryOrder[]>([]);
  const [transactions, setTransactions] = useState<Array<{id: string; order_id: string; status: string; amount?: number; transaction_type?: string; created_at: string}>>([]);
  const [loading, setLoading] = useState(true);
  const [takingOrderId, setTakingOrderId] = useState<string | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editProfile, setEditProfile] = useState<{ full_name: string; email: string; phone: string }>({
    full_name: '',
    email: '',
    phone: ''
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchDeliveries();
      fetchTransactions();
    }
  }, [user]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (user?.id) {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('id', user.id)
          .single();
        if (!error && data) {
          setUserProfile(data as ProfileRow);
          setEditProfile({
            full_name: data.full_name || '',
            email: user.email || '',
            phone: data.phone || ''
          });
        }
      }
    };
    fetchProfile();
  }, [user]);

  useEffect(() => {
    const channel = supabase
      .channel('orders-changes-delivery')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        console.log('DeliveryDashboard: Changement orders détecté', payload);
        fetchDeliveries();
        fetchTransactions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_transactions' }, (payload) => {
        console.log('DeliveryDashboard: Changement transactions détecté', payload);
        fetchTransactions();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchDeliveries = async () => {
    if (!user?.id) return;
    
    try {
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
        .in('status', ['assigned', 'in_delivery', 'delivered'])
        .order('created_at', { ascending: false });

      if (error2) throw error2;

      setDeliveries((availableDeliveries ?? []) as DeliveryOrder[]);
      setMyDeliveries((myActiveDeliveries ?? []) as DeliveryOrder[]);
    } catch (error) {
      console.error('Erreur lors du chargement des livraisons:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    if (!user?.id) return;
    
    try {
      // Récupérer les transactions de paiement pour les livraisons de ce livreur
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('payment_transactions')
        .select(`
          *,
          orders!inner(delivery_person_id, order_code, vendor_id, buyer_id)
        `)
        .eq('orders.delivery_person_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Erreur lors du chargement des transactions:', error);
    }
  };

  const deliveriesInProgress = myDeliveries.filter(d => d.status === 'in_delivery' || d.status === 'assigned');
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
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Livré</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  const renderDeliveryCard = (delivery: DeliveryOrder, variant: 'current' | 'completed') => {
    // Trouver les transactions associées à cette livraison
    const payoutTransaction = transactions.find(t => t.order_id === delivery.id && t.transaction_type === 'payout');
    
    return (
      <Card key={delivery.id} className={`border ${variant === 'current' ? 'border-orange-200' : 'border-green-200'} shadow-sm`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className={`font-mono text-xs px-2 py-0.5 rounded-full ${variant === 'current' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
              {delivery.order_code}
            </span>
            {getStatusBadge(delivery.status)}
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Package className={`h-4 w-4 ${variant === 'current' ? 'text-green-500' : 'text-green-500'}`} />
            {delivery.products?.name}
          </h3>
          <div className="space-y-1 text-sm text-gray-600">
            <p><span className="font-medium">Client :</span> {delivery.buyer_profile?.full_name || 'N/A'}</p>
            {delivery.buyer_profile?.phone && (
              <p className="text-xs text-gray-500">📞 {delivery.buyer_profile.phone}</p>
            )}
            <p><span className="font-medium">Vendeur(se) :</span> {delivery.vendor_profile?.full_name || 'N/A'}</p>
            {delivery.vendor_profile?.phone && (
              <p className="text-xs text-gray-500">📞 {delivery.vendor_profile.phone}</p>
            )}
            <p>Adresse : {delivery.delivery_address}</p>
          </div>
          {/* Affichage du statut de paiement vendeur(se) */}
          {delivery.status === 'delivered' && payoutTransaction && (
            <div className="mt-2 p-2 bg-purple-50 rounded-md">
              <p className="text-xs font-medium text-purple-900">
                💰 Paiement vendeur(se): 
                <span className={`ml-2 px-2 py-0.5 rounded ${
                  payoutTransaction.status === 'SUCCESSFUL' ? 'bg-green-100 text-green-800' :
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
          <div className="mt-3 text-lg font-bold text-green-600">
            {delivery.total_amount?.toLocaleString()} FCFA
          </div>
          {variant === 'current' && (
            <div className="mt-4">
              <Button
                className="w-full bg-green-500 hover:bg-green-600 text-white"
                onClick={() => navigate(`/scanner?orderId=${delivery.id}`)}
              >
                <QrCode className="h-4 w-4 mr-2" />
                Marquer livré
              </Button>
            </div>
          )}
          {variant === 'completed' && (
            <div className="flex items-center gap-2 mt-4 text-green-700">
              <CheckCircle className="h-4 w-4" />
              <span className="font-medium text-sm">Livraison terminée</span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">

      {/* Header Moderne - Style similaire à VendorDashboard */}
      <header className="bg-gradient-to-r from-green-500 to-green-600 rounded-b-2xl shadow-lg mb-6">
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
          <Tabs defaultValue="in_progress" className="space-y-6">
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
              <div className="flex justify-end">
                <Link to="/scanner">
                  <Button className="bg-orange-500 hover:bg-orange-600 text-white">
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
                    <Link to="/scanner">
                      <Button className="bg-green-500 hover:bg-green-600 text-white">
                        <QrCode className="h-4 w-4 mr-2" />
                        Scanner une commande
                      </Button>
                    </Link>
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
                        <label className="text-sm font-medium text-gray-500">Email</label>
                        <p className="text-lg">{user?.email}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Téléphone</label>
                        <p className="text-lg">{userProfile?.phone || 'Non renseigné'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Statistiques</label>
                        <div className="grid grid-cols-2 gap-4 mt-2">
                          <div className="bg-green-50 p-3 rounded-lg">
                            <p className="text-2xl font-bold text-green-600">{inProgressDeliveries}</p>
                            <p className="text-sm text-gray-600">En cours</p>
                          </div>
                          <div className="bg-green-50 p-3 rounded-lg">
                            <p className="text-2xl font-bold text-green-600">{completedDeliveries}</p>
                            <p className="text-sm text-gray-600">Terminées</p>
                          </div>
                        </div>
                      </div>
                      <Button 
                        onClick={() => setIsEditingProfile(true)}
                        className="bg-green-500 hover:bg-green-600"
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
                        <label className="text-sm font-medium">Email</label>
                        <Input
                          name="email"
                          value={editProfile.email}
                          disabled
                          className="bg-gray-100"
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
            </TabsContent>
          </Tabs>
        </div>

        {/* Navigation Mobile - Bottom Navigation Bar */}
        <div className="md:hidden">
          <Tabs defaultValue="in_progress" className="pb-20 px-0">
            <div className="space-y-6">
              <TabsContent value="in_progress" className="mt-0">
                <div className="space-y-4">
                  <h2 className="text-base font-semibold">En cours ({inProgressDeliveries})</h2>
                  <div className="flex justify-end">
                    <Link to="/scanner">
                      <Button className="bg-orange-500 hover:bg-orange-600 text-white text-xs">
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
                        <Link to="/scanner">
                          <Button className="bg-green-500 hover:bg-green-600 text-white text-sm">
                            <QrCode className="h-4 w-4 mr-2" />
                            Scanner
                          </Button>
                        </Link>
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
                            <label className="text-sm font-medium text-gray-500">Email</label>
                            <p className="text-lg">{user?.email}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-500">Téléphone</label>
                            <p className="text-lg">{userProfile?.phone || 'Non défini'}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-500">Statistiques</label>
                            <div className="grid grid-cols-2 gap-3 mt-2">
                              <div className="bg-green-50 p-3 rounded-lg text-center">
                                <p className="text-xl font-bold text-green-600">{inProgressDeliveries}</p>
                                <p className="text-xs text-gray-600">En cours</p>
                              </div>
                              <div className="bg-green-50 p-3 rounded-lg text-center">
                                <p className="text-xl font-bold text-green-600">{completedDeliveries}</p>
                                <p className="text-xs text-gray-600">Terminées</p>
                              </div>
                            </div>
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
                    className="flex flex-col items-center justify-center space-y-1 h-14 w-20 data-[state=active]:bg-green-50 data-[state=active]:text-green-600 rounded-xl transition-all"
                  >
                    <Truck className="h-5 w-5" />
                    <span className="text-xs font-medium">En cours</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="completed" 
                    className="flex flex-col items-center justify-center space-y-1 h-14 w-20 data-[state=active]:bg-green-50 data-[state=active]:text-green-600 rounded-xl transition-all"
                  >
                    <CheckCircle className="h-5 w-5" />
                    <span className="text-xs font-medium">Terminées</span>
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
    </div>
  );
};

export default DeliveryDashboard;
