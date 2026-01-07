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
import { Product, Order } from '@/types/database';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  StatsCard, 
  StatusBadge
} from '@/components/dashboard';
import { toFrenchErrorMessage } from '@/lib/errors';

type ProfileRow = {
  full_name: string | null;
  phone: string | null;
  walletType?: string | null;
};

const VendorDashboard = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  // States
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
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
  } | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editProfile, setEditProfile] = useState({
    full_name: '',
    email: '',
    phone: '',
    walletType: ''
  });
  const [savingProfile, setSavingProfile] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!user) return;

    const walletColumnMissing = (err: { message?: string } | null) =>
      Boolean(err?.message && (err.message.includes("column") && err.message.includes("wallet")));

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, phone, wallet_type')
        .eq('id', user.id)
        .single<ProfileRow>();

      let profileData: ProfileRow | null = null;
      let queryError = error ?? null;

      if (walletColumnMissing(error)) {
        const fallback = await supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('id', user.id)
          .single<Pick<ProfileRow, 'full_name' | 'phone'>>();

        queryError = fallback.error ?? null;
        if (!fallback.error && fallback.data) {
          profileData = {
            full_name: fallback.data.full_name ?? null,
            phone: fallback.data.phone ?? null,
            walletType: null
          };
        }
      } else if (!error && data) {
        profileData = {
          full_name: data.full_name ?? null,
          phone: data.phone ?? null,
          walletType: (data as unknown as { wallet_type?: string }).wallet_type ?? null
        };
      }

      if (queryError && !walletColumnMissing(queryError)) {
        throw queryError;
      }

      if (profileData) {
        const fullName = profileData.full_name ?? '';
        const phone = profileData.phone ?? '';
        const walletType = profileData.walletType ?? '';

        setUserProfile({ full_name: fullName, phone });
        setEditProfile({
          full_name: fullName,
          email: user.email || '',
          phone,
          walletType
        });
      }
    } catch (error) {
      // Profile might not exist yet, that's ok
    }
  }, [user]);

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
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de charger les produits",
        variant: "destructive",
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
        profiles: o.profiles ? { full_name: o.profiles.full_name || '' } : undefined
      })) as Order[];
      setOrders(mappedOrders.filter(order => order.status !== 'pending'));
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de charger les commandes",
        variant: "destructive",
      });
    }
  }, [user, toast]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await Promise.all([fetchProfile(), fetchProducts(), fetchOrders()]);
      setLoading(false);
    };

    if (user) {
      fetchData();
    }
  }, [user, fetchProfile, fetchProducts, fetchOrders]);

  // Live updates: écoute les changements sur les commandes du vendeur
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`orders-vendor-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `vendor_id=eq.${user.id}` },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchOrders]);

  const generateProductCode = async () => {
    if (!user?.id) throw new Error('User not authenticated');
    const { data: products } = await supabase
      .from('products')
      .select('code')
      .eq('vendor_id', user.id);
    
    let nextNumber = 1;
    if (products && products.length > 0) {
      const codes = products.map(p => p.code).filter(Boolean);
      const numbers = codes.map(code => {
        const match = code.match(/^pv(\d{4})$/i);
        return match ? parseInt(match[1], 10) : 0;
      });
      nextNumber = Math.max(...numbers, 0) + 1;
    }
    
    return `pv${nextNumber.toString().padStart(4, '0')}`;
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
      if (!user?.id) {
        throw new Error('User not authenticated');
      }
      const code = await generateProductCode();
      const { error } = await supabase
        .from('products')
        .insert({
          vendor_id: user.id,
          name: newProduct.name,
          price: parseInt(newProduct.price),
          description: newProduct.description,
          warranty: newProduct.warranty,
          code,
          is_available: true,
          stock_quantity: 0
        });

      if (error) throw error;

      toast({
        title: 'Succès',
        description: 'Produit ajouté avec succès'
      });

      setNewProduct({ name: '', price: '', description: '', warranty: '' });
      setAddModalOpen(false);
      fetchProducts();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible d\'ajouter le produit',
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
      const { error } = await supabase
        .from('products')
        .update({
          name: editProduct.name,
          price: parseInt(String(editProduct.price)),
          description: editProduct.description,
          warranty: editProduct.warranty
        })
        .eq('id', editProduct.id);

      if (error) throw error;

      toast({
        title: 'Succès',
        description: 'Produit modifié avec succès'
      });

      setEditModalOpen(false);
      setEditProduct(null);
      fetchProducts();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de modifier le produit',
        variant: 'destructive'
      });
    } finally {
      setEditing(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!deleteProductId) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', deleteProductId);

      if (error) throw error;

      toast({
        title: 'Succès',
        description: 'Produit supprimé avec succès'
      });

      setDeleteDialogOpen(false);
      setDeleteProductId(null);
      fetchProducts();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de supprimer le produit',
        variant: 'destructive'
      });
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
      console.log('Mise à jour profil vendeur pour user:', user.id);
      console.log('Données:', { full_name: editProfile.full_name, phone: editProfile.phone, wallet_type: editProfile.walletType });
      
      const { data, error } = await supabase
        .from('profiles')
        .update({
          full_name: editProfile.full_name,
          phone: editProfile.phone,
          wallet_type: editProfile.walletType || null,
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

  // Calculate stats
  const totalProducts = products.length;
  const activeProducts = products.filter(p => p.is_available).length;
  const totalOrders = orders.length;
  const totalRevenue = orders
    .filter(o => o.status === 'delivered')
    .reduce((sum, o) => sum + (o.total_amount || 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // Fonction pour déconnexion
  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">

      {/* Header Moderne - Style similaire à BuyerDashboard */}
      <header className="bg-gradient-to-r from-green-500 to-green-600 rounded-b-2xl shadow-lg mb-6">
        <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col items-center justify-center">
          <h1 className="text-3xl md:text-4xl font-extrabold text-white drop-shadow-lg text-center tracking-tight">
            Validèl
          </h1>
          <p className="text-white/90 text-sm mt-1">Espace Vendeur</p>
        </div>
      </header>

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
            <Button 
              onClick={() => setAddModalOpen(true)}
              className="bg-green-500 hover:bg-green-600 text-white shadow-md flex-shrink-0 text-sm px-4 py-2"
            >
              <Plus className="h-4 w-4 mr-2" />
              Ajouter
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {products.map((product) => (
              <Card key={product.id} className="hover:shadow-lg transition-shadow h-fit">
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
                  
                  {/* Code Produit - Format texte simple */}
                  <div className="text-xs font-mono text-gray-500 mb-2">
                    Code : {product.code || `PROD-${product.id}`}
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
                    <Button variant="outline" size="sm" className="flex-1">
                      <Eye className="h-4 w-4 mr-1" />
                      Voir
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setEditProduct({
                          ...product,
                          price: product.price || 0
                        });
                        setEditModalOpen(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setDeleteProductId(product.id);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {products.length === 0 && (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun produit</h3>
              <p className="text-gray-500 mb-4">Commencez par ajouter votre premier produit</p>
              <Button 
                onClick={() => setAddModalOpen(true)}
                className="bg-green-500 hover:bg-green-600"
              >
                <Plus className="h-4 w-4 mr-2" />
                Ajouter un produit
              </Button>
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
                {orders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <h4 className="font-medium">{order.products?.name}</h4>
                      {order.order_code && (
                        <div className="mt-1 text-xs font-mono text-blue-700">
                          Code commande : <span className="bg-blue-100 px-2 py-0.5 rounded">{order.order_code}</span>
                        </div>
                      )}
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Client:</span> {order.profiles?.full_name || 'Client'}
                      </p>
                      {order.profiles?.phone && (
                        <p className="text-sm text-gray-500">
                          📞 {order.profiles.phone}
                        </p>
                      )}
                      {order.delivery_person && (
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Livreur:</span> {order.delivery_person.full_name}
                          {order.delivery_person.phone && ` - ${order.delivery_person.phone}`}
                        </p>
                      )}
                      <p className="text-sm text-gray-500">
                        {new Date(order.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-600">
                        {order.total_amount?.toLocaleString()} CFA
                      </p>
                      <StatusBadge 
                        status={order.status as 'pending' | 'confirmed' | 'delivered' | 'cancelled'} 
                        size="sm" 
                      />
                    </div>
                  </div>
                ))}
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
                      <label className="text-sm font-medium text-gray-500">Email</label>
                      <p className="text-lg">{user?.email}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Téléphone</label>
                      <p className="text-lg">{userProfile?.phone || 'Non renseigné'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Type de wallet</label>
                      <p className="text-lg">{editProfile.walletType || 'Non renseigné'}</p>
                    </div>
                    <Button 
                      onClick={() => setIsEditingProfile(true)}
                      className="bg-green-500 hover:bg-green-600"
                    >
                      Modifier le profil
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
                        onChange={handleProfileChange}
                        placeholder="Votre email"
                        type="email"
                        disabled
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
                      <label className="text-sm font-medium">Type de wallet</label>
                      <select
                        name="walletType"
                        value={editProfile.walletType}
                        onChange={handleProfileChange}
                        className="w-full border border-gray-300 rounded-md px-3 py-2"
                        title="Type de wallet pour recevoir les paiements"
                      >
                        <option value="">Choisir un wallet...</option>
                        <option value="wave-senegal">Wave Sénégal</option>
                        <option value="orange-money-senegal">Orange Money Sénégal</option>
                        <option value="orange_senegal">Orange Money Sénégal (alt)</option>
                        <option value="orange-money">Orange Money</option>
                      </select>
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
                <div>
                  <label className="text-sm font-medium text-gray-500">Wallet utilisé</label>
                  <p className="text-lg">
                    {editProfile.walletType || 'Non renseigné'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Rôle</label>
                  <p className="text-lg">Vendeur</p>
                </div>
                <Button 
                  variant="destructive"
                  onClick={signOut}
                >
                  Se déconnecter
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
                  <Button 
                    onClick={() => setAddModalOpen(true)}
                className="bg-green-500 hover:bg-green-600 text-white shadow-md flex-shrink-0 text-xs px-3 py-2"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Ajouter
                  </Button>
                </div>

                <div className="grid gap-4">
                  {products.map((product) => (
                    <Card key={product.id} className="border border-gray-200">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h3 className="font-medium">{product.name}</h3>
                            <p className="text-sm text-gray-600 mt-1">{product.description}</p>
                            
                            {/* Code Produit - Format texte simple */}
                            <div className="text-xs font-mono text-gray-500 mb-2">
                              Code : {product.code || `PROD-${product.id}`}
                            </div>
                            
                            <div className="flex items-center justify-between mt-2">
                              <span className="font-semibold text-green-600">{product.price} CFA</span>
                              <StatusBadge 
                                status={product.is_available ? 'active' : 'inactive'} 
                                size="sm" 
                              />
                            </div>
                          </div>
                          <div className="flex space-x-2 ml-4">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditProduct(product);
                                setEditModalOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setDeleteProductId(product.id);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="orders" className="mt-0">
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Commandes ({totalOrders})</h2>
                <div className="grid gap-4">
                  {orders.map((order) => (
                    <Card key={order.id} className="border border-gray-200">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{order.products?.name || `Commande #${order.id?.slice(-6)}`}</p>
                            {order.order_code && (
                              <div className="text-xs font-mono text-blue-700 mb-2">Code commande : <span className="bg-blue-100 px-2 py-0.5 rounded">{order.order_code}</span></div>
                            )}
                            <p className="text-sm font-medium text-gray-600">Client: {order.profiles?.full_name || 'N/A'}</p>
                            {order.profiles?.phone && (
                              <p className="text-xs text-gray-500">📞 {order.profiles.phone}</p>
                            )}
                            {order.delivery_person && (
                              <>
                                <p className="text-sm font-medium text-gray-600 mt-1">Livreur: {order.delivery_person.full_name}</p>
                                {order.delivery_person.phone && (
                                  <p className="text-xs text-gray-500">📞 {order.delivery_person.phone}</p>
                                )}
                              </>
                            )}
                            <p className="text-sm text-gray-500">{new Date(order.created_at || '').toLocaleDateString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">{order.total_amount} CFA</p>
                            <StatusBadge 
                              status={order.status === 'pending' ? 'pending' : 
                                     order.status === 'paid' ? 'paid' : 
                                     order.status === 'delivered' ? 'delivered' : 
                                     order.status === 'cancelled' ? 'cancelled' : 'pending'} 
                              size="sm" 
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
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
                          <select
                            className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-100 text-gray-700 mt-1"
                            value={editProfile.walletType}
                            disabled
                            title="Type de compte de paiement utilisé"
                          >
                            <option value="">Non défini</option>
                            <option value="wave-senegal">Wave Sénégal</option>
                            <option value="orange-money-senegal">Orange Money Sénégal</option>
                          </select>
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
                          onClick={signOut}
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
                        <div>
                          <label className="text-sm font-medium">Compte de paiement</label>
                          <select
                            name="walletType"
                            value={editProfile.walletType}
                            onChange={handleProfileChange}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 mt-1"
                            title="Type de compte de paiement utilisé"
                          >
                            <option value="">Choisir un compte...</option>
                            <option value="wave-senegal">Wave Sénégal</option>
                            <option value="orange-money-senegal">Orange Money Sénégal</option>
                            <option value="orange_senegal">Orange Money Sénégal (alt)</option>
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
    </div>
  );
};

export default VendorDashboard;
