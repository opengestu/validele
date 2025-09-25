
import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Package, Clock, Truck, CheckCircle, QrCode } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const OrderTracking = () => {
  const { orderId } = useParams();
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchOrders();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchOrders = async () => {
    try {
      let query = supabase
        .from('orders')
        .select(`
          *,
          products(name, code),
          profiles!orders_vendor_id_fkey(full_name, company_name)
        `)
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: false });

      if (orderId) {
        query = query.eq('id', orderId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Erreur lors du chargement des commandes:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status, completed) => {
    if (completed) {
      return <CheckCircle className="h-5 w-5 text-green-600" />;
    }
    
    switch (status) {
      case 'pending': return <Package className="h-5 w-5 text-gray-400" />;
      case 'paid': return <Clock className="h-5 w-5 text-gray-400" />;
      case 'in_delivery': return <Truck className="h-5 w-5 text-gray-400" />;
      case 'delivered': return <CheckCircle className="h-5 w-5 text-gray-400" />;
      default: return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'pending': return 'Commande confirmée';
      case 'paid': return 'Paiement validé';
      case 'in_delivery': return 'En livraison';
      case 'delivered': return 'Livré';
      case 'cancelled': return 'Annulé';
      default: return status;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'paid': return 'bg-blue-100 text-blue-800';
      case 'in_delivery': return 'bg-purple-100 text-purple-800';
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const generateQRCode = (qrCode) => {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
        <rect width="200" height="200" fill="white"/>
        <g fill="black">
          <rect x="20" y="20" width="20" height="20"/>
          <rect x="60" y="20" width="20" height="20"/>
          <rect x="100" y="20" width="20" height="20"/>
          <rect x="140" y="20" width="20" height="20"/>
          <rect x="20" y="60" width="20" height="20"/>
          <rect x="100" y="60" width="20" height="20"/>
          <rect x="160" y="60" width="20" height="20"/>
          <rect x="40" y="100" width="20" height="20"/>
          <rect x="80" y="100" width="20" height="20"/>
          <rect x="120" y="100" width="20" height="20"/>
          <rect x="160" y="100" width="20" height="20"/>
          <rect x="20" y="140" width="20" height="20"/>
          <rect x="60" y="140" width="20" height="20"/>
          <rect x="140" y="140" width="20" height="20"/>
          <rect x="40" y="160" width="20" height="20"/>
          <rect x="120" y="160" width="20" height="20"/>
        </g>
        <text x="100" y="190" text-anchor="middle" font-size="12" fill="black">${qrCode}</text>
      </svg>
    `)}`;
  };

  const getOrderSteps = (order) => {
    const steps = [
      { status: 'pending', completed: true, date: order.created_at },
      { status: 'paid', completed: order.status !== 'pending', date: order.payment_confirmed_at || order.created_at },
      { status: 'in_delivery', completed: ['in_delivery', 'delivered'].includes(order.status), date: order.status === 'in_delivery' || order.status === 'delivered' ? order.updated_at : null },
      { status: 'delivered', completed: order.status === 'delivered', date: order.delivered_at }
    ];
    return steps;
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            <Link to="/buyer">
              <ArrowLeft className="h-6 w-6 text-gray-600 hover:text-blue-600" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Suivi de mes commandes</h1>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="space-y-8">
          {orders.map((order) => {
            const steps = getOrderSteps(order);
            
            return (
              <Card key={order.id} className="overflow-hidden">
                <CardHeader className="bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center space-x-2">
                        <span>Commande {order.order_code}</span>
                        <span className={`text-xs font-medium px-2.5 py-0.5 rounded ${getStatusColor(order.status)}`}>
                          {getStatusText(order.status)}
                        </span>
                      </CardTitle>
                      <p className="text-gray-600 mt-1">{order.products?.name}</p>
                      <p className="text-sm text-gray-500">Commandé le {new Date(order.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-blue-600">{order.total_amount.toLocaleString()} FCFA</p>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="p-6">
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold mb-4">Suivi de la commande</h3>
                    <div className="space-y-4">
                      {steps.map((step, index) => (
                        <div key={step.status} className="flex items-center space-x-4">
                          <div className={`flex-shrink-0 ${step.completed ? 'text-green-600' : 'text-gray-400'}`}>
                            {getStatusIcon(step.status, step.completed)}
                          </div>
                          <div className="flex-1">
                            <p className={`font-medium ${step.completed ? 'text-gray-900' : 'text-gray-500'}`}>
                              {getStatusText(step.status)}
                            </p>
                            {step.date && (
                              <p className="text-sm text-gray-500">
                                {new Date(step.date).toLocaleString()}
                              </p>
                            )}
                          </div>
                          {index < steps.length - 1 && (
                            <div className={`w-px h-8 ml-2.5 ${step.completed ? 'bg-green-200' : 'bg-gray-200'}`} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {order.status === 'in_delivery' && (
                    <div className="border-t pt-6">
                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <h3 className="text-lg font-semibold mb-2 flex items-center">
                            <QrCode className="h-5 w-5 mr-2" />
                            Votre QR Code de validation
                          </h3>
                          <p className="text-gray-600 mb-4">
                            Présentez ce QR code au livreur pour confirmer la réception de votre commande.
                          </p>
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                            <p className="text-sm text-yellow-800">
                              <strong>Important :</strong> Ne partagez ce code qu'avec le livreur officiel au moment de la livraison.
                            </p>
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="inline-block bg-white p-4 rounded-lg shadow-lg">
                            <img 
                              src={generateQRCode(order.qr_code)}
                              alt={`QR Code ${order.qr_code}`}
                              className="w-48 h-48 mx-auto"
                            />
                            <p className="text-sm text-gray-600 mt-2">Code: {order.qr_code}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {order.status === 'delivered' && (
                    <div className="border-t pt-6">
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div className="flex items-center">
                          <CheckCircle className="h-6 w-6 text-green-600 mr-3" />
                          <div>
                            <h3 className="text-lg font-semibold text-green-800">Commande livrée avec succès</h3>
                            <p className="text-green-700">Livré le {new Date(order.delivered_at).toLocaleString()}</p>
                            <p className="text-sm text-green-600 mt-1">Les fonds ont été transférés au vendeur</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {orders.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <Package className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-xl font-semibold mb-2">Aucune commande</h3>
                <p className="text-gray-600">Vous n'avez pas encore passé de commande.</p>
                <Link to="/buyer" className="inline-block mt-4">
                  <button className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
                    Commencer mes achats
                  </button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderTracking;
