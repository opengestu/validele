import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Phone, MessageCircle, Package, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiUrl } from '@/lib/api';

type OrderContact = { name: string; phone: string | null };
type OrderData = {
  id: string;
  orderCode: string | null;
  status: string;
  totalAmount: number;
  deliveryAddress: string | null;
  createdAt: string;
  product: { name: string; price: number; imageUrl: string | null } | null;
  vendor: OrderContact | null;
  delivery: OrderContact | null;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: 'En attente de paiement', cls: 'bg-gray-100 text-gray-700' },
  paid: { label: 'Payée', cls: 'bg-purple-100 text-purple-700' },
  in_delivery: { label: 'En cours de livraison', cls: 'bg-blue-600 text-white' },
  delivered: { label: 'Livrée', cls: 'bg-green-600 text-white' },
  cancelled: { label: 'Annulée', cls: 'bg-red-100 text-red-700' },
};

// Frise de progression (l'annulation est un cas à part, masqué).
const STEPS = ['paid', 'in_delivery', 'delivered'];
const STEP_LABELS: Record<string, string> = {
  paid: 'Payée',
  in_delivery: 'En livraison',
  delivered: 'Livrée',
};

const waLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`;
const telLink = (phone: string) => `tel:${phone.replace(/[\s()]/g, '')}`;

const GuestOrderTracking = () => {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchOrder = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(apiUrl(`/api/guest/order/${encodeURIComponent(id)}`));
      const json: any = await resp.json().catch(() => null);
      if (!resp.ok || !json?.success) {
        throw new Error(json?.error || 'Commande introuvable.');
      }
      setOrder(json.order);
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger la commande.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchOrder();
  }, [fetchOrder]);

  const status = order?.status || 'pending';
  const statusMeta = STATUS_META[status] || STATUS_META.pending;
  const currentStepIndex = STEPS.indexOf(status);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-2">
          <Package className="h-6 w-6 text-green-600" />
          <h1 className="text-xl font-bold text-gray-900">Suivi de commande</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin mb-3" />
            <p>Chargement…</p>
          </div>
        ) : error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-8 text-center text-red-600">
              <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-70" />
              <h3 className="text-lg font-semibold mb-1">{error}</h3>
              <p className="text-sm">Vérifiez le lien reçu ou contactez votre vendeur.</p>
              <Button variant="outline" className="mt-4" onClick={() => void fetchOrder()}>
                Réessayer
              </Button>
            </CardContent>
          </Card>
        ) : order ? (
          <div className="space-y-4">
            {/* En-tête commande */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                      {order.product?.name || 'Produit'}
                    </h2>
                    {order.orderCode && (
                      <p className="text-sm text-gray-500 mt-1">Commande {order.orderCode}</p>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${statusMeta.cls}`}>
                    {statusMeta.label}
                  </span>
                </div>

                <p className="text-3xl font-bold text-green-600 mt-4">
                  {Number(order.totalAmount).toLocaleString()} FCFA
                </p>

                {order.deliveryAddress && (
                  <p className="text-sm text-gray-600 mt-3">
                    <span className="font-medium text-gray-700">Livraison :</span> {order.deliveryAddress}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Frise de progression (masquée si annulée) */}
            {status !== 'cancelled' && (
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    {STEPS.map((step, index) => {
                      const done = currentStepIndex >= index && currentStepIndex >= 0;
                      return (
                        <React.Fragment key={step}>
                          <div className="flex flex-col items-center text-center flex-1">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                done ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'
                              }`}
                            >
                              {index + 1}
                            </div>
                            <span className={`mt-2 text-[11px] ${done ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                              {STEP_LABELS[step]}
                            </span>
                          </div>
                          {index < STEPS.length - 1 && (
                            <div className={`h-0.5 flex-1 mx-1 ${currentStepIndex > index ? 'bg-green-600' : 'bg-gray-200'}`} />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Contacts */}
            <Card>
              <CardContent className="p-6 space-y-4">
                {order.vendor && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Vendeur : <span className="text-gray-900">{order.vendor.name}</span>
                    </p>
                    {order.vendor.phone ? (
                      <div className="flex gap-2">
                        <a href={telLink(order.vendor.phone)} className="flex-1">
                          <Button variant="outline" className="w-full">
                            <Phone className="h-4 w-4 mr-2 text-green-600" /> Appeler
                          </Button>
                        </a>
                        <a href={waLink(order.vendor.phone)} target="_blank" rel="noopener noreferrer" className="flex-1">
                          <Button variant="outline" className="w-full">
                            <MessageCircle className="h-4 w-4 mr-2 text-green-600" /> WhatsApp
                          </Button>
                        </a>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">Contact non disponible</p>
                    )}
                  </div>
                )}

                {order.delivery && order.delivery.phone && (
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Livreur : <span className="text-gray-900">{order.delivery.name}</span>
                    </p>
                    <a href={telLink(order.delivery.phone)} className="block">
                      <Button variant="outline" className="w-full">
                        <Phone className="h-4 w-4 mr-2 text-green-600" /> Appeler le livreur
                      </Button>
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
              <ShieldCheck className="h-4 w-4" />
              Paiement protégé par Validèl jusqu'à la réception.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default GuestOrderTracking;
