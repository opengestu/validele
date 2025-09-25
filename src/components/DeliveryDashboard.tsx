/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Truck, QrCode, Package, CheckCircle, Clock, User, Menu, UserCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

type ProfileRow = {
  full_name: string | null;
};

type DeliveryOrder = {
  id: string;
  status: string;
  order_code?: string | null;
  products?: { name?: string | null; code?: string | null } | null;
  buyer_profile?: { full_name?: string | null } | null;
  delivery_address?: string | null;
  buyer_phone?: string | null;
  total_amount?: number | null;
};

const DeliveryDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<ProfileRow | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
  const [myDeliveries, setMyDeliveries] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editProfile, setEditProfile] = useState<{ full_name?: string; email?: string }>({});
  const [savingProfile, setSavingProfile] = useState(false);
  // Suppression de l'ancien flux de confirmation directe
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchDeliveries();
    }
  }, [user]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (user?.id) {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();
  if (!error && data) setUserProfile(data as ProfileRow);
      }
    };
    fetchProfile();
  }, [user]);

  useEffect(() => {
    if (userProfile && user) {
      setEditProfile({
        full_name: userProfile.full_name || '',
        email: user.email || ''
      });
    }
  }, [userProfile, user]);

  useEffect(() => {
    const channel = supabase
      .channel('orders-changes-delivery')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
        fetchDeliveries();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchDeliveries = async () => {
    try {
      console.log('Démarrage du chargement des livraisons pour le livreur:', user?.id);
      
      // Livraisons disponibles (payées mais pas encore assignées)
      console.log('Recherche des livraisons disponibles...');
      
      // Simplifions la requête pour voir toutes les commandes d'abord
      const { data: allOrders, error: debugError } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
      
      console.log('Toutes les commandes pour debug:', { allOrders, error: debugError });
      
      // Maintenant la requête spécifique pour les livraisons disponibles
      const { data: availableDeliveries, error: error1 } = await supabase
        .from('orders')
        .select(`
          *,
          products(name, code),
          buyer_profile:profiles!orders_buyer_id_fkey(full_name)
        `)
        .eq('status', 'paid')
        .is('delivery_person_id', null)
        .order('created_at', { ascending: false });

      console.log('Livraisons disponibles trouvées:', { availableDeliveries, error: error1 });

      if (error1) {
        console.error('Erreur lors du chargement des livraisons disponibles:', error1);
        throw error1;
      }

      // Mes livraisons en cours
      console.log('Recherche de mes livraisons en cours...');
      const { data: myActiveDeliveries, error: error2 } = await supabase
        .from('orders')
        .select(`
          *,
          products(name, code),
          buyer_profile:profiles!orders_buyer_id_fkey(full_name)
        `)
        .eq('delivery_person_id', user.id)
        .in('status', ['in_delivery', 'delivered'])
        .order('created_at', { ascending: false });

      console.log('Mes livraisons trouvées:', { myActiveDeliveries, error: error2 });

      if (error2) {
        console.error('Erreur lors du chargement de mes livraisons:', error2);
        throw error2;
      }

  setDeliveries((availableDeliveries ?? []) as DeliveryOrder[]);
  setMyDeliveries((myActiveDeliveries ?? []) as DeliveryOrder[]);
      console.log('myDeliveries après update:', myActiveDeliveries);
      
      console.log('État final:', {
        availableCount: (availableDeliveries || []).length,
        myDeliveriesCount: (myActiveDeliveries || []).length
      });
    } catch (error) {
      console.error('Erreur lors du chargement des livraisons:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTakeDelivery = async (orderId) => {
    try {
      console.log('Prise en charge de la commande:', orderId, 'par le livreur:', user.id);
      
      const { error } = await supabase
        .from('orders')
        .update({ 
          delivery_person_id: user.id,
          status: 'in_delivery'
        })
        .eq('id', orderId);

      if (error) {
        console.error('Erreur lors de la prise en charge:', error);
        throw error;
      }
      
      console.log('Commande prise en charge avec succès');
      await fetchDeliveries();
    } catch (error) {
      console.error('Erreur lors de la prise en charge:', error);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'in_delivery':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><Truck className="h-3 w-3 mr-1" />En cours</span>;
      case 'delivered':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Livré</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  const deliveriesInProgress = myDeliveries.filter(d => d.status === 'in_delivery');
  const deliveriesCompleted = myDeliveries.filter(d => d.status === 'delivered');
  const inProgressDeliveries = deliveriesInProgress.length;
  const completedDeliveries = deliveriesCompleted.length;
  const availableDeliveriesCount = deliveries.length;
  const totalTrackedDeliveries = myDeliveries.length;
  const completionRate = totalTrackedDeliveries > 0 ? Math.round((completedDeliveries / totalTrackedDeliveries) * 100) : 0;

  const handleProfileChange = (e) => {
    setEditProfile({ ...editProfile, [e.target.name]: e.target.value });
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    // Update profile
    const updates: { full_name?: string } = {
      full_name: editProfile.full_name
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
      // Recharger le profil
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setUserProfile(data);
      setDrawerOpen(false);
      setIsEditing(false);
    }
  };

  const handleSignOut = async () => {
    if (typeof window !== 'undefined') {
      localStorage.clear();
    }
    window.location.href = '/auth';
  };

  // L'action se fait désormais via la page /scanner (validation QR)

  const renderDeliveryCard = (delivery: DeliveryOrder, variant: 'current' | 'completed') => {
    const commonHeader = (
      <div className="flex items-center justify-between mb-3">
        <span className={`font-mono text-xs px-2 py-0.5 rounded-full ${variant === 'current' ? 'bg-purple-100 text-purple-700' : 'bg-white/70 text-emerald-700'}`}>
          {delivery.order_code}
        </span>
        {getStatusBadge(delivery.status)}
      </div>
    );

    const titleBlock = (
      <h3 className={`text-lg font-bold text-gray-900 mb-2 flex items-center gap-2 ${variant === 'current' ? 'text-inherit' : ''}`}>
        <Package className={`h-4 w-4 ${variant === 'current' ? 'text-purple-400' : 'text-emerald-500'}`} /> {delivery.products?.name}
      </h3>
    );

    const detailsBlock = (
      <div className="space-y-1 text-sm text-gray-700">
        <p>
          <span className="font-medium">Client :</span> {delivery.buyer_profile?.full_name || 'N/A'}
        </p>
        <p>Adresse : {delivery.delivery_address}</p>
        <p>Téléphone : {delivery.buyer_phone}</p>
      </div>
    );

    const amountBlock = (
      <div className="mt-3 text-lg font-bold text-emerald-600">
        {delivery.total_amount?.toLocaleString()} FCFA
      </div>
    );

    if (variant === 'current') {
      return (
        <Card key={delivery.id} className="border-0 shadow-lg rounded-3xl bg-white/85 backdrop-blur hover:shadow-xl transition-all">
          <CardContent className="p-6">
            {commonHeader}
            {titleBlock}
            {detailsBlock}
            {amountBlock}
            <div className="flex flex-wrap gap-3 mt-5">
              <Button
                variant="outline"
                className="rounded-full border-purple-200 text-purple-600 hover:bg-purple-50"
                onClick={() => {
                  // Redirige vers la page de scan pour valider la livraison
                  navigate(`/scanner?orderId=${delivery.id}`);
                }}
              >
                Marquer livré
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card key={delivery.id} className="border-0 shadow-lg rounded-3xl bg-gradient-to-br from-emerald-500/10 to-sky-500/15">
        <CardContent className="p-6">
          {commonHeader}
          {titleBlock}
          {detailsBlock}
          {amountBlock}
          <div className="flex items-center gap-2 mt-4 text-emerald-700">
            <CheckCircle className="h-4 w-4" />
            <span className="font-medium">Livraison terminée</span>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 pb-12">
      {/* Header moderne */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-2 sm:px-4 py-4 sm:py-6 relative flex items-center rounded-b-xl shadow-sm bg-gradient-to-b from-white to-blue-50">
          {/* Colonne gauche : hamburger */}
          <div className="flex items-center justify-start z-10">
            <button
              className="sm:hidden flex items-center justify-center p-2 rounded-md hover:bg-gray-100 focus:outline-none"
              onClick={() => setDrawerOpen(true)}
              aria-label="Ouvrir le menu profil"
            >
              <Menu className="h-7 w-7 text-gray-700" />
            </button>
          </div>
          {/* Titre centré absolument */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-full pointer-events-none">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 leading-tight text-center pointer-events-none">
              Livreur
            </h1>
            </div>
          {/* Colonne droite : avatar desktop */}
          <div className="hidden sm:flex items-center justify-end w-full max-w-[48px] ml-auto z-10">
            <button
              className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 focus:outline-none border border-gray-200"
              onClick={() => setDrawerOpen(true)}
              aria-label="Profil"
            >
              {userProfile?.full_name && userProfile.full_name.trim() ? (
                <span className="font-bold text-gray-700 text-lg">
                  {userProfile.full_name
                    .split(' ')
                    .filter(Boolean)
                    .map(n => n[0]?.toUpperCase() || '')
                    .join('')
                    .slice(0,2)}
                </span>
              ) : (
                <UserCircle className="h-7 w-7 text-gray-400" />
              )}
            </button>
          </div>
        </div>
        {/* Drawer profil mobile+desktop */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 flex">
            {/* Overlay */}
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity" onClick={() => setDrawerOpen(false)}></div>
            {/* Drawer */}
            <div className="relative ml-auto w-72 max-w-full h-full bg-white shadow-xl p-6 flex flex-col animate-slide-in-right">
              <button
                className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
                onClick={() => setDrawerOpen(false)}
                aria-label="Fermer le menu"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <div className="flex flex-col items-center mt-8 gap-2">
                <User className="h-12 w-12 text-gray-400 mb-2" />
                {!isEditing ? (
                  <>
                    <span className="font-bold text-lg text-gray-900 border-b-2 border-blue-400 pb-1 mb-1 w-full text-center block">
                      {userProfile?.full_name}
                    </span>
                    <span className="text-gray-500 text-sm w-full text-center block bg-gray-50 border-b border-gray-200 py-1">
                      {user?.email}
                    </span>
                  </>
                ) : (
                  <>
                    <input
                      className="font-bold text-lg text-gray-900 text-center border-b-2 border-blue-400 focus:border-blue-600 outline-none bg-white mb-1 w-full placeholder-gray-400"
                      name="full_name"
                      value={editProfile.full_name || ''}
                      onChange={handleProfileChange}
                      placeholder="Nom complet"
                      maxLength={40}
                      autoFocus
                    />
                    <input
                      className="text-gray-700 text-sm text-center border-b-2 border-blue-400 focus:border-blue-600 outline-none bg-white mb-1 w-full placeholder-gray-400"
                      name="email"
                      value={editProfile.email || ''}
                      onChange={handleProfileChange}
                      placeholder="Email"
                      type="email"
                    />
                  </>
                )}
              </div>
              <div className="mt-8 flex-1 flex flex-col gap-2 justify-end">
                {!isEditing ? (
                  <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => setIsEditing(true)}>
                    Modifier
                  </Button>
                ) : (
                  <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={handleSaveProfile} disabled={savingProfile}>
                    {savingProfile ? 'Enregistrement...' : 'Enregistrer'}
                  </Button>
                )}
                <Button className="w-full bg-red-600 hover:bg-red-700" onClick={handleSignOut}>
                  Déconnexion
                </Button>
              </div>
                </div>
              </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10 space-y-12">
        {/* Section livraisons en cours */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-purple-600" />
            <h2 className="text-xl font-semibold text-purple-900">Mes livraisons en cours</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {deliveriesInProgress.length === 0 && (
              <div className="col-span-2">
                <div className="relative overflow-hidden rounded-3xl border border-purple-100 bg-white/90 backdrop-blur shadow-lg px-6 py-10 flex flex-col items-center text-center">
                  <div className="absolute -top-10 -right-10 h-36 w-36 rounded-full bg-purple-200/40 blur-2xl" aria-hidden="true" />
                  <div className="absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-blue-200/30 blur-3xl" aria-hidden="true" />
                  <Truck className="relative h-12 w-12 text-purple-500 mb-4" />
                  <h3 className="relative text-lg font-semibold text-purple-800">Aucune livraison en cours</h3>
                  <p className="relative mt-2 text-sm text-purple-500 max-w-md">
                    Scannez un QR code pour prendre en charge une commande et démarrez votre tournée immédiatement.
                  </p>
                  <Link to="/scanner" className="relative mt-6">
                    <Button className="bg-gradient-to-r from-purple-500 to-sky-500 hover:from-purple-600 hover:to-sky-600 text-white px-5 py-2 rounded-full shadow-purple-400/40">
                      <QrCode className="h-4 w-4 mr-2" /> Scanner une commande
                    </Button>
                  </Link>
                </div>
              </div>
            )}
            {deliveriesInProgress.map(delivery => renderDeliveryCard(delivery, 'current'))}
          </div>
        </section>

        {/* Section livraisons terminées */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            <h2 className="text-xl font-semibold text-emerald-900">Livraisons terminées</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {deliveriesCompleted.length === 0 && (
              <div className="col-span-2">
                <div className="relative overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-white via-emerald-50 to-sky-50 px-6 py-10 flex flex-col items-center text-center shadow-lg">
                  <div className="absolute -top-12 -left-8 h-32 w-32 rounded-full bg-emerald-200/40 blur-2xl" aria-hidden="true" />
                  <div className="absolute -bottom-14 right-0 h-36 w-36 rounded-full bg-sky-200/30 blur-3xl" aria-hidden="true" />
                  <CheckCircle className="relative h-12 w-12 text-emerald-500 mb-4" />
                  <h3 className="relative text-lg font-semibold text-emerald-800">Aucune livraison terminée</h3>
                  <p className="relative mt-2 text-sm text-emerald-600 max-w-md">
                    Une fois les colis livrés, marquez-les comme terminés pour suivre vos performances et vos gains.
                  </p>
                </div>
              </div>
            )}
            {deliveriesCompleted.map(delivery => renderDeliveryCard(delivery, 'completed'))}
          </div>
        </section>
      </main>

      {/* La confirmation de livraison se fait désormais exclusivement via le scan QR (/scanner) */}
    </div>
  );
};

export default DeliveryDashboard;
