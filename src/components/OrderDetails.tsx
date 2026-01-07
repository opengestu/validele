import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Clock, CheckCircle, Truck, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui/spinner';
import OrderQRCode from './OrderQRCode';

const OrderDetails = () => {
  const { orderId } = useParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showOnlyQR, setShowOnlyQR] = useState(false);

  useEffect(() => {
    const fetchOrder = async () => {
      if (!orderId) return;
      
      try {
        const { data, error } = await supabase
          .from('orders')
          .select(`
            *,
            products(name, price, description),
            profiles!orders_buyer_id_fkey(full_name, phone),
            profiles!orders_vendor_id_fkey(full_name, company_name, phone)
          `)
          .eq('id', orderId)
          .single();

        if (error) throw error;
        setOrder(data);
      } catch (error) {
        console.error('Erreur lors du chargement de la commande:', error);
        toast({
          title: "Erreur",
          description: "Impossible de charger les détails de la commande",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, toast]);

  const getStatusText = (status) => {
    switch (status) {
      case 'pending': return 'En attente';
      case 'paid': return 'Payé';
      case 'in_delivery': return 'En livraison';
      case 'delivered': return 'Livré';
      case 'cancelled': return 'Annulé';
      default: return status;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': return Clock;
      case 'paid': return CheckCircle;
      case 'in_delivery': return Truck;
      case 'delivered': return CheckCircle;
      case 'cancelled': return Clock;
      default: return Package;
    }
  };

  const getPaymentMethodText = (method) => {
    switch (method) {
      case 'wave': return 'Wave';
      default: return method;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Commande non trouvée</p>
      </div>
    );
  }

  const StatusIcon = getStatusIcon(order.status);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(-1)}
                className="flex items-center space-x-2"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Retour</span>
              </Button>
              <h1 className="text-xl font-semibold text-gray-900">Détails de la commande</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Informations de la commande */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Package className="h-5 w-5" />
                  <span>Informations de la commande</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Statut:</span>
                  <div className="flex items-center space-x-2">
                    <StatusIcon className="h-4 w-4" />
                    <span className="font-medium">{getStatusText(order.status)}</span>
                  </div>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Code commande:</span>
                  <span className="font-medium">{order.order_code}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Date de création:</span>
                  <span className="font-medium">
                    {new Date(order.created_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>

                {order.payment_confirmed_at && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Paiement confirmé:</span>
                    <span className="font-medium">
                      {new Date(order.payment_confirmed_at).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                )}

                {order.delivered_at && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Livré le:</span>
                    <span className="font-medium">
                      {new Date(order.delivered_at).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Informations du produit */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Package className="h-5 w-5" />
                  <span>Produit commandé</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold">{order.products?.name}</h3>
                    <p className="text-gray-600">{order.products?.description}</p>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Prix unitaire:</span>
                    <span className="font-medium">{order.products?.price?.toLocaleString()} FCFA</span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Quantité:</span>
                    <span className="font-medium">{order.quantity || 1}</span>
                  </div>
                  
                  <div className="pt-4 border-t">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold">Total:</span>
                      <span className="text-lg font-bold text-blue-600">{order.total_amount.toLocaleString()} FCFA</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Informations de livraison */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Truck className="h-5 w-5" />
                  <span>Informations de livraison</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-gray-600 block mb-1">Adresse de livraison:</span>
                  <p className="font-medium">{order.delivery_address}</p>
                </div>
                
                <div>
                  <span className="text-gray-600 block mb-1">Téléphone:</span>
                  <p className="font-medium">{order.buyer_phone}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Colonne de droite */}
          <div className="space-y-6">
            {/* Informations du vendeur */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <User className="h-5 w-5" />
                  <span>Informations du vendeur</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <span className="text-gray-600 block mb-1">Nom:</span>
                    <p className="font-medium">{order.profiles?.full_name || order.profiles?.company_name || 'N/A'}</p>
                  </div>
                  
                  {order.profiles?.phone && (
                    <div>
                      <span className="text-gray-600 block mb-1">Téléphone:</span>
                      <p className="font-medium">{order.profiles.phone}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* QR Code */}
            {order.qr_code && (
              <Card>
                <CardHeader>
                  <CardTitle>QR Code de commande</CardTitle>
                </CardHeader>
                <CardContent>
                  <OrderQRCode qrCode={order.qr_code} orderCode={''} productName={''} totalAmount={0} />
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setShowOnlyQR(true)}
                  >
                    Voir QR Code
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => navigate('/buyer')}
                  >
                    Retour au tableau de bord
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Modal QR Code plein écran */}
      {showOnlyQR && order.qr_code && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-lg max-w-md w-full mx-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-4">QR Code de commande</h3>
              <OrderQRCode qrCode={order.qr_code} orderCode={''} productName={''} totalAmount={0} />
              <Button 
                className="mt-4 w-full"
                onClick={() => setShowOnlyQR(false)}
              >
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderDetails;
