/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Plus, Eye, BarChart3, LogOut, ShoppingCart, Clock, Copy, ShoppingBag, User, CheckCircle, XCircle, PlusCircle, Menu, UserCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Product, Order } from '@/types/database';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const VendorDashboard = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: '',
    price: '',
    description: '',
    warranty: ''
  });
  const [userProfile, setUserProfile] = useState<{ full_name?: string } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editProfile, setEditProfile] = useState<{ full_name?: string; email?: string; phone?: string; walletType?: string }>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteProductId, setDeleteProductId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editProductFields, setEditProductFields] = useState({ name: '', price: '', description: '', warranty: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newProductFields, setNewProductFields] = useState({ name: '', price: '', description: '', warranty: '' });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (user) {
      fetchProducts();
      fetchOrders();
      fetchProfile();
    }
  }, [user]);

  useEffect(() => {
    if (userProfile && user) {
      setEditProfile({
        full_name: userProfile.full_name || '',
        email: user.email || '',
        phone: userProfile.phone || '',
        walletType: userProfile.walletType || '',
      });
    }
  }, [userProfile, user]);

  useEffect(() => {
    const channel = supabase
      .channel('orders-changes-vendor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
        fetchOrders();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Ajout d'un canal realtime pour les produits (stock)
  useEffect(() => {
    const channel = supabase
      .channel('products-changes-vendor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, payload => {
        fetchProducts();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('vendor_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts(data || []);
     
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: "Impossible de charger les produits",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    if (!user) return;
    
    setOrdersLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          products(name),
          profiles!orders_buyer_id_fkey(full_name)
        `)
        .eq('vendor_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setOrders((data || []).filter(order => order.status !== 'pending'));
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
  };

  const fetchProfile = async () => {
    if (user?.id) {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, phone, walletType')
        .eq('id', user.id)
        .single();
      if (!error) setUserProfile(data);
    }
  };

  const generateProductCode = async () => {
    const { data: products, error } = await supabase
      .from('products')
      .select('id, code')
      .eq('vendor_id', user?.id);
    let nextNumber = 0;
    if (products && products.length > 0) {
      const max = products.reduce((acc, p) => {
        const match = p.code && p.code.match(/^pv(\d{4})$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          return num > acc ? num : acc;
        }
        return acc;
      }, 0);
      nextNumber = max + 1;
    }
    if (nextNumber > 9999) throw new Error('Limite de 9999 produits atteinte pour ce vendeur');
    return `pv${nextNumber.toString().padStart(4, '0')}`.toLowerCase();
  };

  const handleAddProduct = async () => {
    if (!newProductFields.name || !newProductFields.price || !newProductFields.description) {
      toast({ title: 'Erreur', description: 'Veuillez remplir tous les champs obligatoires', variant: 'destructive' });
      return;
    }
    setAdding(true);
    try {
      const code = await generateProductCode();
      const { data, error } = await supabase
        .from('products')
        .insert({
          vendor_id: user?.id,
          name: newProductFields.name,
          price: parseInt(newProductFields.price),
          description: newProductFields.description,
          warranty: newProductFields.warranty,
          code,
          is_available: true,
          stock_quantity: 0
        })
        .select()
        .single();
      if (error) throw error;
      setProducts([data, ...products]);
      setNewProductFields({ name: '', price: '', description: '', warranty: '' });
      setAddModalOpen(false);
      toast({ title: 'Produit ajouté', description: 'Produit créé avec succès.' });
    } catch (error: any) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } finally {
      setAdding(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'paid': return 'bg-blue-100 text-blue-800';
      case 'in_delivery': return 'bg-purple-100 text-purple-800';
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'En attente';
      case 'paid': return 'Payé';
      case 'in_delivery': return 'En livraison';
      case 'delivered': return 'Livré';
      case 'cancelled': return 'Annulé';
      default: return status;
    }
  };

  const getPaymentMethodText = (method: string) => {
    switch (method) {
      case 'wave': return 'Wave';
      default: return method;
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copié !',
      description: 'Le code a été copié dans le presse-papier',
    });
  };

  // Statistiques
  const totalOrders = orders.length;
  const deliveredOrders = orders.filter(o => o.status === 'delivered').length;
  const totalRevenue = orders.filter(o => o.status === 'delivered').reduce((sum, o) => sum + (o.total_amount || 0), 0);

  // Badge statut
  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"><Clock className="h-3 w-3 mr-1" />En attente</span>;
      case 'paid':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Payée</span>;
      case 'in_delivery':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><Package className="h-3 w-3 mr-1" />En livraison</span>;
      case 'delivered':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Livrée</span>;
      case 'cancelled':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Annulée</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  const handleProfileChange = (e) => {
    setEditProfile({ ...editProfile, [e.target.name]: e.target.value });
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editProfile.full_name,
          phone: editProfile.phone,
          walletType: editProfile.walletType,
        })
        .eq('id', user.id);
      if (error) throw error;
      toast({ title: 'Profil mis à jour', description: 'Vos informations ont été enregistrées.' });
      setUserProfile({ ...userProfile, ...editProfile });
      setIsEditing(false);
    } catch (error: unknown) {
      let errorMessage = 'Erreur inconnue';
      if (error instanceof Error) errorMessage = error.message;
      toast({ title: 'Erreur', description: errorMessage, variant: 'destructive' });
    } finally {
      setSavingProfile(false);
    }
  };

  // Ouvre la modale d'édition
  const handleOpenEdit = (product: Product) => {
    setEditProduct(product);
    setEditProductFields({
      name: product.name || '',
      price: product.price?.toString() || '',
      description: product.description || '',
      warranty: product.warranty || ''
    });
    setEditModalOpen(true);
  };

  // Sauvegarde édition
  const handleSaveEdit = async () => {
    if (!editProduct) return;
    setSavingEdit(true);
    try {
      const { error, data } = await supabase
        .from('products')
        .update({
          name: editProductFields.name,
          price: parseInt(editProductFields.price),
          description: editProductFields.description,
          warranty: editProductFields.warranty
        })
        .eq('id', editProduct.id)
        .select()
        .single();
      if (error) throw error;
      setProducts(products => products.map(p => p.id === data.id ? data : p));
      setEditModalOpen(false);
      toast({ title: 'Produit modifié', description: 'Les modifications ont été enregistrées.' });
    } catch (error: any) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } finally {
      setSavingEdit(false);
    }
  };

  // Ouvre le dialogue de suppression
  const handleOpenDelete = (productId: string) => {
    setDeleteProductId(productId);
    setDeleteDialogOpen(true);
  };

  // Confirme suppression
  const handleConfirmDelete = async () => {
    if (!deleteProductId) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', deleteProductId);
      if (error) throw error;
      setProducts(products => products.filter(p => p.id !== deleteProductId));
      setDeleteDialogOpen(false);
      toast({ title: 'Produit supprimé', description: 'Le produit a été supprimé.' });
    } catch (error: any) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleUpdateStock = async (productId: string, newStock: number) => {
    try {
      const { error, data } = await supabase
        .from('products')
        .update({ stock_quantity: newStock })
        .eq('id', productId)
        .select()
        .single();
      if (error) throw error;
      setProducts(products => products.map(p => p.id === productId ? { ...p, stock_quantity: newStock } : p));
      toast({ title: 'Stock mis à jour', description: `Stock actuel : ${newStock}` });
    } catch (error: any) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-yellow-50 pb-12">
      {/* Header moderne */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-2 sm:px-4 py-4 sm:py-6 relative flex items-center rounded-b-xl shadow-sm bg-gradient-to-b from-white to-yellow-50">
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
              Vendeur
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
                    <span className="font-bold text-lg text-gray-900 border-b-2 border-yellow-400 pb-1 mb-1 w-full text-center block">
                      {userProfile?.full_name}
                    </span>
                    <span className="text-gray-500 text-sm w-full text-center block bg-gray-50 border-b border-gray-200 py-1">
                      {user?.email}
                    </span>
                  </>
                ) : (
                  <>
                    <input
                      className="font-bold text-lg text-gray-900 text-center border-b-2 border-yellow-400 focus:border-yellow-600 outline-none bg-white mb-1 w-full placeholder-gray-400"
                      name="full_name"
                      value={editProfile.full_name || ''}
                      onChange={handleProfileChange}
                      placeholder="Nom complet"
                      maxLength={40}
                      autoFocus
                    />
                    <input
                      className="text-gray-700 text-sm text-center border-b-2 border-yellow-400 focus:border-yellow-600 outline-none bg-white mb-1 w-full placeholder-gray-400"
                      name="email"
                      value={editProfile.email || ''}
                      onChange={handleProfileChange}
                      placeholder="Email"
                      type="email"
                    />
                    <input
                      className="text-gray-700 text-sm text-center border-b-2 border-yellow-400 focus:border-yellow-600 outline-none bg-white mb-1 w-full placeholder-gray-400"
                      name="phone"
                      value={editProfile.phone || ''}
                      onChange={handleProfileChange}
                      placeholder="Numéro mobile pour paiement"
                    />
                    <select
                      name="walletType"
                      value={editProfile.walletType || ''}
                      onChange={handleProfileChange}
                      className="w-full border rounded px-3 py-2"
                      title="Wallet pour recevoir les paiements"
                    >
                      <option value="">Choisir...</option>
                      <option value="wave-senegal">Wave Sénégal</option>
                      <option value="orange-money-senegal">Orange Money Sénégal</option>
                      <option value="orange_senegal">Orange Money Sénégal (alt)</option>
                      <option value="orange-money">Orange Money</option>
                    </select>
                  </>
                )}
            </div>
              <div className="mt-8 flex-1 flex flex-col gap-2 justify-end">
                {!isEditing ? (
                  <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => setIsEditing(true)}>
                    Modifier
                  </Button>
                ) : (
                  <Button className="w-full bg-yellow-600 hover:bg-yellow-700" onClick={handleSaveProfile} disabled={savingProfile}>
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

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Statistiques */}
        <section className="grid md:grid-cols-3 gap-6 mb-10">
          <Card>
            <CardContent className="p-6 flex items-center gap-4">
                <Package className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">Commandes reçues</p>
                <p className="text-2xl font-bold text-gray-900">{totalOrders}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 flex items-center gap-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-sm text-gray-600">Commandes livrées</p>
                <p className="text-2xl font-bold text-gray-900">{deliveredOrders}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 flex items-center gap-4">
              <ShoppingBag className="h-8 w-8 text-yellow-600" />
              <div>
                <p className="text-sm text-gray-600">Chiffre d'affaires</p>
                <p className="text-2xl font-bold text-gray-900">{totalRevenue.toLocaleString()} FCFA</p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Produits */}
        <section>
          <div className="mb-4">
            <div className="block sm:hidden mb-3">
              <Button className="bg-green-600 hover:bg-green-700 rounded-full px-3 py-2 text-base flex items-center gap-2 min-h-0 h-10" onClick={() => setAddModalOpen(true)}>
                <PlusCircle className="h-4 w-4" /> Ajouter un produit
              </Button>
            </div>
              <div className="flex items-center">
              <h2 className="text-xl font-semibold text-yellow-900 flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-yellow-600" /> Produits
              </h2>
              <div className="ml-auto hidden sm:block">
                <Button className="bg-green-600 hover:bg-green-700 rounded-full px-3 py-2 text-base flex items-center gap-2 min-h-0 h-10" onClick={() => setAddModalOpen(true)}>
                  <PlusCircle className="h-4 w-4" /> Ajouter un produit
                </Button>
              </div>
        </div>
                    </div>
          <div className="grid gap-6 md:grid-cols-2">
            {products.length === 0 && (
              <div className="text-gray-400 text-center col-span-2">Aucun produit</div>
            )}
            {products.map((product) => (
              <Card key={product.id} className="shadow border-0">
                <CardContent className="p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4 text-yellow-600" /> {product.name}
                  </h3>
                  <div className="text-xs font-mono text-gray-500 mb-2">Code : {product.code}</div>
                  <div className="text-sm text-gray-700 mb-2">Prix : <span className="font-bold text-green-700">{product.price.toLocaleString()} FCFA</span></div>
                  <div className="text-sm text-gray-600 mb-1">Stock : {product.stock_quantity}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <Button size="icon" variant="outline" className="border-gray-300" onClick={() => handleUpdateStock(product.id, (product.stock_quantity || 0) - 1)} disabled={product.stock_quantity === 0}>
                      –
                    </Button>
                    <span className="font-bold text-lg w-8 text-center">{product.stock_quantity}</span>
                    <Button size="icon" variant="outline" className="border-gray-300" onClick={() => handleUpdateStock(product.id, (product.stock_quantity || 0) + 1)}>
                      +
                    </Button>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button className="bg-blue-600 hover:bg-blue-700 rounded-full px-4 py-2 flex items-center gap-2" onClick={() => handleOpenEdit(product)}>
                      <Package className="h-4 w-4" /> Modifier
                    </Button>
                    <Button className="bg-red-600 hover:bg-red-700 rounded-full px-4 py-2 flex items-center gap-2" onClick={() => handleOpenDelete(product.id)}>
                      <XCircle className="h-4 w-4" /> Supprimer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Commandes */}
        <hr className="my-8 border-t-2 border-gray-200" />
        <section className="mb-10 bg-blue-50 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Package className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-blue-900">Mes commandes</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {orders.length === 0 && (
              <div className="text-gray-400 text-center col-span-2">Aucune commande reçue</div>
            )}
            {orders.filter(order => order.status !== 'pending').map((order) => (
              <Card key={order.id} className="shadow-md border-0 hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{order.order_code}</span>
                    {getStatusBadge(order.status)}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                    <Package className="h-4 w-4 text-gray-400" /> {order.products?.name}
                  </h3>
                  <div className="text-xs font-mono text-blue-700 mb-2">Code commande : <span className="bg-blue-100 px-2 py-0.5 rounded">{order.order_code}</span></div>
                  <div className="text-sm text-gray-700 mb-2">
                    <span className="font-medium">Client :</span> {order.profiles?.full_name || 'N/A'}
                  </div>
                  <div className="text-sm text-gray-600 mb-1">Adresse : {order.delivery_address}</div>
                  <div className="text-sm text-gray-600 mb-1">Téléphone : {order.buyer_phone}</div>
                  <div className="text-lg font-bold text-green-600 mb-2">{order.total_amount.toLocaleString()} FCFA</div>
                  <div className="flex gap-2 mt-4">
                    <Link to={`/orders/${order.id}`}>
                      <Button className="bg-blue-600 hover:bg-blue-700 rounded-full px-4 py-2 flex items-center gap-2">
                        <Package className="h-4 w-4" /> Détails
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>

      {/* Modale édition produit */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le produit</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-2">
            <input className="border rounded px-3 py-2" placeholder="Nom" value={editProductFields.name} onChange={e => setEditProductFields(f => ({ ...f, name: e.target.value }))} />
            <input className="border rounded px-3 py-2" placeholder="Prix" type="number" value={editProductFields.price} onChange={e => setEditProductFields(f => ({ ...f, price: e.target.value }))} />
            <textarea className="border rounded px-3 py-2" placeholder="Description" value={editProductFields.description} onChange={e => setEditProductFields(f => ({ ...f, description: e.target.value }))} />
            <input className="border rounded px-3 py-2" placeholder="Garantie (optionnel)" value={editProductFields.warranty} onChange={e => setEditProductFields(f => ({ ...f, warranty: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button onClick={handleSaveEdit} disabled={savingEdit} className="bg-yellow-600 hover:bg-yellow-700 w-full mt-4">
              {savingEdit ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogue confirmation suppression */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le produit</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center">Voulez-vous vraiment supprimer ce produit ?</div>
          <DialogFooter>
            <Button onClick={handleConfirmDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 w-full">
              {deleting ? 'Suppression...' : 'Confirmer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modale ajout produit */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un produit</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-2">
            <input className="border rounded px-3 py-2" placeholder="Nom" value={newProductFields.name} onChange={e => setNewProductFields(f => ({ ...f, name: e.target.value }))} />
            <input className="border rounded px-3 py-2" placeholder="Prix" type="number" value={newProductFields.price} onChange={e => setNewProductFields(f => ({ ...f, price: e.target.value }))} />
            <textarea className="border rounded px-3 py-2" placeholder="Description" value={newProductFields.description} onChange={e => setNewProductFields(f => ({ ...f, description: e.target.value }))} />
            <input className="border rounded px-3 py-2" placeholder="Garantie (optionnel)" value={newProductFields.warranty} onChange={e => setNewProductFields(f => ({ ...f, warranty: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button onClick={handleAddProduct} disabled={adding} className="bg-green-600 hover:bg-green-700 w-full mt-4">
              {adding ? 'Ajout...' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VendorDashboard;
