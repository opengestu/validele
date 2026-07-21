import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Phone, MessageCircle, Package, ShieldCheck, AlertTriangle, QrCode } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import SimpleQRCode from '@/components/ui/SimpleQRCode';
import { apiUrl } from '@/lib/api';

const CANCEL_REASONS = [
  'Produit non conforme',
  'Produit non reçu',
  'Délai de livraison trop long',
  'Erreur de commande',
  "Changement d'avis",
  'Autre',
];

// Mêmes statuts autorisés que côté backend (/api/payment/pixpay/refund) : une commande
// pas encore payée n'a rien à rembourser, une commande livrée est déjà finalisée.
const CANCELLABLE_STATUSES = ['paid', 'in_delivery'];

type OrderContact = { name: string; phone: string | null };
type OrderData = {
  id: string;
  orderCode: string | null;
  status: string;
  totalAmount: number;
  deliveryAddress: string | null;
  createdAt: string;
  qrCode: string | null;
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

  // --- Annuler / demander un remboursement --------------------------------
  // Réutilise l'endpoint existant /api/payment/pixpay/refund (déjà utilisable sans
  // compte : il ne vérifie que l'orderId, comme le reste du suivi invité). Crée une
  // demande examinée par un admin, qui déclenche le vrai remboursement Wave/OM.
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const handleRequestCancel = useCallback(async () => {
    if (!order) return;
    setCancelLoading(true);
    setCancelError('');
    try {
      const resp = await fetch(apiUrl('/api/payment/pixpay/refund'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, reason: cancelReason || 'Non satisfaction client' }),
      });
      const json: any = await resp.json().catch(() => null);
      if (!resp.ok || !json?.success) {
        throw new Error(json?.error || 'Impossible de soumettre la demande.');
      }
      setCancelOpen(false);
      setCancelReason('');
      await fetchOrder();
    } catch (e: any) {
      setCancelError(e?.message || 'Une erreur est survenue, réessayez.');
    } finally {
      setCancelLoading(false);
    }
  }, [order, cancelReason, fetchOrder]);

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

            {/* QR code de réception : à présenter au livreur pour confirmer la remise du
                colis. Disponible dès le paiement pour que l'acheteur l'ait sous la main. */}
            {order.qrCode && ['paid', 'in_delivery'].includes(status) && (
              <Card className="border-orange-200">
                <CardContent className="p-6 text-center">
                  <h3 className="text-base font-semibold text-gray-900 mb-1 flex items-center justify-center gap-2">
                    <QrCode className="h-5 w-5 text-orange-500" />
                    Votre QR code de réception
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Présentez ce QR code au livreur au moment de la livraison pour confirmer que vous avez bien reçu votre colis.
                  </p>
                  <div className="inline-block bg-white p-4 rounded-lg border-2 border-gray-200">
                    <SimpleQRCode value={order.qrCode} size={200} />
                  </div>
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-4">
                    ⚠️ Ne montrez ce code qu'au livreur officiel, au moment de la remise du colis.
                  </p>
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

            {/* Signaler un problème / annuler — seulement tant qu'un remboursement a
                un sens (payée ou en livraison). Une commande livrée ou déjà annulée
                affiche un message informatif à la place. */}
            {CANCELLABLE_STATUSES.includes(status) ? (
              <Card className="border-red-100">
                <CardContent className="p-6">
                  <p className="text-sm text-gray-600 mb-3">
                    Produit non reçu, non conforme, ou tout autre problème ? Vous pouvez annuler et demander un remboursement.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => { setCancelError(''); setCancelOpen(true); }}
                  >
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Signaler un problème / Annuler
                  </Button>
                </CardContent>
              </Card>
            ) : status === 'cancelled' ? (
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="p-4 text-sm text-amber-800 text-center">
                  Votre commande a été annulée. Le remboursement est en cours d'examen par notre équipe.
                </CardContent>
              </Card>
            ) : null}

            <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
              <ShieldCheck className="h-4 w-4" />
              Paiement protégé par Validèl jusqu'à la réception.
            </div>
          </div>
        ) : null}
      </div>

      <Dialog open={cancelOpen} onOpenChange={(open) => { if (!cancelLoading) setCancelOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Annuler et demander un remboursement
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Votre demande sera examinée par un administrateur. Une fois approuvée, le montant sera remboursé sur le compte Wave ou Orange Money utilisé pour payer.
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Raison de l'annulation</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                disabled={cancelLoading}
              >
                <option value="">Sélectionner une raison</option>
                {CANCEL_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {cancelError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {cancelError}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setCancelOpen(false)}
                disabled={cancelLoading}
              >
                Retour
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                onClick={handleRequestCancel}
                disabled={cancelLoading}
              >
                {cancelLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Traitement…
                  </>
                ) : (
                  "Confirmer l'annulation"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GuestOrderTracking;
