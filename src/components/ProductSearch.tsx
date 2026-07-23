import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Loader2, Search, ShoppingCart, Shield, Image as ImageIcon, Minus, Plus } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { apiUrl } from '@/lib/api';

const SHARED_PRODUCT_PENDING_CODE_KEY = 'pending_shared_product_code';

const waveLogo = '/images/wave.png';
const orangeMoneyLogo = '/images/orange_money.png';

const ProductImage3D = ({ imageUrl, name }: { imageUrl?: string | null; name?: string }) => (
  imageUrl ? (
    <img
      src={imageUrl}
      alt={name ? `Image de ${name}` : 'Image du produit'}
      className="h-64 w-full rounded-xl border border-gray-200 object-cover"
      loading="lazy"
    />
  ) : (
    <div className="flex h-64 w-full flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-100 text-gray-500">
      <ImageIcon className="mb-2 h-9 w-9" />
      <span className="text-sm font-medium">Aucune image</span>
    </div>
  )
);

const ProductSearch = () => {
  const { code: codeFromUrl } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const { user, userProfile, loading: authLoading } = useAuth();
  const [searchCode, setSearchCode] = useState('');
  const [searchResult, setSearchResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const isNonBuyerSession = Boolean(userProfile?.role && userProfile.role !== 'buyer');
  const roleLabel = userProfile?.role === 'vendor'
    ? 'vendeur(se)'
    : userProfile?.role === 'delivery'
      ? 'livreur(se)'
      : userProfile?.role === 'admin'
        ? 'admin'
        : 'utilisateur';
  const dashboardPath = userProfile?.role === 'vendor'
    ? '/vendor'
    : userProfile?.role === 'delivery'
      ? '/delivery'
      : userProfile?.role === 'admin'
        ? '/admin'
        : '/';
  const hasShareCodeInUrl = Boolean((codeFromUrl || '').trim());
  const isWebContext = !Capacitor.isNativePlatform();
  const isNativeProductLink = Capacitor.isNativePlatform() && hasShareCodeInUrl;
  const showNonBuyerLinkNotice = !authLoading && isNonBuyerSession && hasShareCodeInUrl;

  const persistPendingProductCode = useCallback((rawCode?: string | null) => {
    const code = String(rawCode || '').trim();
    if (typeof window === 'undefined') return;
    if (!code) {
      localStorage.removeItem(SHARED_PRODUCT_PENDING_CODE_KEY);
      return;
    }
    localStorage.setItem(SHARED_PRODUCT_PENDING_CODE_KEY, code);
  }, []);

  useEffect(() => {
    if (!isNativeProductLink) return;
    const rawCode = decodeURIComponent(String(codeFromUrl || '')).trim();
    if (!rawCode || typeof window === 'undefined') return;
    persistPendingProductCode(rawCode);
  }, [codeFromUrl, isNativeProductLink, persistPendingProductCode]);

  const prepareBuyerAuthEntry = useCallback(() => {
    if (typeof window === 'undefined') return;
    // Repartir sur une saisie de numéro propre.
    localStorage.removeItem('phone_auth_state_v1');
    localStorage.removeItem(SHARED_PRODUCT_PENDING_CODE_KEY);
  }, []);

  const searchProductByCode = useCallback(async (rawCode: string) => {
    const normalizedCode = rawCode.trim();
    if (!normalizedCode) {
      setSearchResult(null);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          profiles(full_name, company_name)
        `)
        .ilike('code', normalizedCode)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setSearchResult(data || null);
    } catch (error) {
      setSearchResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(async () => {
    await searchProductByCode(searchCode);
  }, [searchCode, searchProductByCode]);

  // --- Paiement invité (sans compte) ----------------------------------------
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [payMethod, setPayMethod] = useState<'wave' | 'orange_money'>('wave');
  const [quantity, setQuantity] = useState(1);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutNotice, setCheckoutNotice] = useState('');

  // Frais de protection : lu en temps réel à chaque ouverture du dialog (pas figé
  // au build du site), pour refléter immédiatement un changement de
  // VALIDEL_COMMISSION_PCT côté backend, sans reconstruire/redéployer le site.
  const [protectionFeePct, setProtectionFeePct] = useState(0);
  useEffect(() => {
    if (!checkoutOpen) return;
    setQuantity(1); // repartir d'une quantité 1 à chaque ouverture du dialog
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(apiUrl('/api/config/protection-fee'));
        const json: any = await resp.json().catch(() => null);
        if (!cancelled && json?.success && typeof json.pct === 'number') {
          setProtectionFeePct(json.pct);
        }
      } catch { /* défaut 0 conservé en cas d'échec réseau */ }
    })();
    return () => { cancelled = true; };
  }, [checkoutOpen]);

  const productPrice = searchResult ? Number(searchResult.price) || 0 : 0;
  const lineTotal = productPrice * quantity;
  const protectionFeeAmount = Math.round((lineTotal * protectionFeePct) / 100);
  const totalToPay = lineTotal + protectionFeeAmount;

  const handleGuestCheckout = useCallback(async () => {
    setCheckoutError('');
    setCheckoutNotice('');
    const code = String(searchResult?.code || searchCode || '').trim();
    if (!code) { setCheckoutError('Produit introuvable.'); return; }
    if (!buyerName.trim() || !buyerPhone.trim() || !deliveryAddress.trim()) {
      setCheckoutError('Merci de renseigner votre nom, téléphone et adresse.');
      return;
    }

    setCheckoutLoading(true);
    try {
      // 1) Créer l'acheteur invité + la commande (backend, sans compte/PIN).
      const orderResp = await fetch(apiUrl('/api/guest/order'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productCode: code,
          buyerName: buyerName.trim(),
          buyerPhone: buyerPhone.trim(),
          deliveryAddress: deliveryAddress.trim(),
          quantity,
        }),
      });
      const orderJson: any = await orderResp.json().catch(() => null);
      if (!orderResp.ok || !orderJson?.success) {
        throw new Error(orderJson?.error || 'Impossible de créer la commande.');
      }

      // Mémoriser la commande pour la page de succès + le suivi (acheteur sans compte).
      if (typeof window !== 'undefined') {
        try { localStorage.setItem('validel_last_order_id', String(orderJson.orderId)); } catch { /* ignore */ }
      }

      // 2) Lancer le paiement Wave ou Orange Money (endpoints publics existants).
      const payEndpoint = payMethod === 'wave'
        ? '/api/payment/pixpay-wave/initiate'
        : '/api/payment/pixpay/initiate';
      const payResp = await fetch(apiUrl(payEndpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: orderJson.totalAmount,
          phone: orderJson.buyerPhone,
          orderId: orderJson.orderId,
        }),
      });
      const payJson: any = await payResp.json().catch(() => null);
      if (!payResp.ok || !payJson?.success) {
        throw new Error(payJson?.error || 'Impossible de lancer le paiement.');
      }

      // 3) Rediriger vers le lien de paiement Wave/OM si fourni.
      if (payJson.sms_link) {
        window.location.href = payJson.sms_link;
        return;
      }
      // Wave sans redirection : validation à faire dans l'app Wave / par SMS.
      setCheckoutNotice(payJson.message
        || 'Paiement initié. Ouvrez Wave ou consultez vos SMS pour valider. Votre commande sera confirmée automatiquement.');
    } catch (e: any) {
      setCheckoutError(e?.message || 'Une erreur est survenue, réessayez.');
    } finally {
      setCheckoutLoading(false);
    }
  }, [buyerName, buyerPhone, deliveryAddress, payMethod, quantity, searchResult, searchCode]);

  useEffect(() => {
    if (!codeFromUrl) return;
    const decodedCode = decodeURIComponent(codeFromUrl).trim();
    if (!decodedCode) return;

    // Web (parcours acheteur sans app) : on affiche directement la fiche produit,
    // sans mur « ouvrir/installer l'application ». L'app reste accessible via son
    // propre deep link (validel://) et l'App Link Android, mais n'est plus imposée.
    if (isWebContext) {
      setSearchCode(decodedCode);
      void searchProductByCode(decodedCode);
      return;
    }

    if (authLoading) return;

    if (isNonBuyerSession) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(SHARED_PRODUCT_PENDING_CODE_KEY);
      }
      return;
    }

    // Si l'utilisateur est déjà connecté en tant qu'acheteur, aller directement au flow achat.
    // Sinon, rester sur la page produit pour permettre la consultation du lien sans passer par /auth.
    if (userProfile?.role === 'buyer') {
      persistPendingProductCode(decodedCode);
      navigate(`/buyer?productCode=${encodeURIComponent(decodedCode)}`, { replace: true });
      return;
    }

    setSearchCode(decodedCode);
    void searchProductByCode(decodedCode);
  }, [
    codeFromUrl,
    authLoading,
    isWebContext,
    isNonBuyerSession,
    navigate,
    persistPendingProductCode,
    searchProductByCode,
    userProfile?.role,
  ]);

  if (showNonBuyerLinkNotice) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <Card className="w-full max-w-md border-amber-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-5 w-5" />
              Lien réserve à l'achat
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-amber-900 leading-relaxed">
              Vous êtes connecté(e) en tant que {roleLabel}. Ce lien ouvre un parcours d'achat réservé aux acheteurs.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Link to={dashboardPath}>
                <Button className="w-full" variant="outline">
                  Retour à mon espace
                </Button>
              </Link>
              <Link
                to="/auth?entry=phone&switchAccount=1"
                onClick={prepareBuyerAuthEntry}
              >
                <Button className="w-full">
                  Compte acheteur
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isNativeProductLink && !authLoading && !user) {
    return <Navigate to="/auth?entry=phone" replace />;
  }

  if (isNativeProductLink && !authLoading && userProfile?.role === 'buyer') {
    const rawCode = decodeURIComponent(String(codeFromUrl || '')).trim();
    if (rawCode) {
      return <Navigate to={`/buyer?productCode=${encodeURIComponent(rawCode)}`} replace />;
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            <Link to="/">
              <ArrowLeft className="h-6 w-6 text-gray-600 hover:text-green-600" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Recherche de produit</h1>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Search className="h-5 w-5 mr-2" />
              Rechercher un produit par code
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex space-x-4">
              <Input
                placeholder="Entrez le code produit"
                value={searchCode}
                onChange={(e) => {
                  const nextCode = e.target.value;
                  setSearchCode(nextCode);
                  if (!nextCode.trim()) {
                    setSearchResult(null);
                    setHasSearched(false);
                  }
                }}
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
              />
              <Button
                onClick={handleSearch}
                disabled={loading}
                className="btn-buyer"
              >
                <Search className="h-4 w-4 mr-2" />
                {loading ? 'Recherche...' : 'Rechercher'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {searchResult ? (
          <Card className="border-blue-200">
            <CardContent className="p-8">
              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <ProductImage3D imageUrl={searchResult.image_url} name={searchResult.name} />
                  <div className="flex items-center space-x-2">
                    <Shield className="h-5 w-5 text-green-600" />
                    <span className={`text-sm font-medium ${searchResult.is_available ? 'text-green-600' : 'text-red-600'}`}>
                      {searchResult.is_available ? 'Produit vérifié' : 'Produit inactif'}
                    </span>
                  </div>
                </div>

                <div className="space-y-6">
                  <h2 className="text-3xl font-bold text-gray-900">{searchResult.name}</h2>

                  <p className="text-gray-600 leading-relaxed">{searchResult.description}</p>

                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Catégorie:</span>
                      <span className="text-gray-900">{searchResult.category || 'Non spécifiée'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Disponibilité:</span>
                      <span className={`font-medium ${searchResult.is_available ? 'text-green-600' : 'text-red-600'}`}>
                        {searchResult.is_available ? 'En stock' : 'Inactif'}
                      </span>
                    </div>
                  </div>

                  <div className="border-t pt-6">
                    <p className="text-4xl font-bold text-green-600 mb-6">
                      {searchResult.price.toLocaleString()} FCFA
                    </p>

                    {isNonBuyerSession ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        Vous êtes connecté(e) en tant que {roleLabel}. Pour acheter ce produit, connectez-vous avec un compte acheteur.
                      </div>
                    ) : (
                      <Button
                        className="w-full btn-buyer text-lg py-3"
                        disabled={!searchResult.is_available}
                        onClick={() => {
                          const rawCode = String(searchResult?.code || searchCode || '').trim();
                          if (isWebContext) {
                            // Web : paiement invité sans compte (formulaire ci-dessous).
                            setCheckoutError('');
                            setCheckoutNotice('');
                            setCheckoutOpen(true);
                          } else {
                            // App native : parcours acheteur connecté existant.
                            persistPendingProductCode(rawCode);
                            navigate(rawCode ? `/buyer?productCode=${encodeURIComponent(rawCode)}` : '/buyer');
                          }
                        }}
                      >
                        <ShoppingCart className="h-5 w-5 mr-2" />
                        {searchResult.is_available ? 'Acheter maintenant' : 'Produit inactif'}
                      </Button>
                    )}

                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : hasSearched && !loading && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-8 text-center">
              <div className="text-red-600">
                <Search className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <h3 className="text-xl font-semibold mb-2">Produit non trouvé</h3>
                <p>Aucun produit trouvé avec le code "{searchCode}"</p>
                <p className="text-sm mt-2">Vérifiez le code ou contactez le vendeur</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Comment ça marche ?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6 text-center">
              <div>
                <div className="bg-blue-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-green-600 font-bold">1</span>
                </div>
                <h4 className="font-medium mb-2">Obtenez le code</h4>
                <p className="text-sm text-gray-600">Le vendeur vous communique le code unique du produit</p>
              </div>
              <div>
                <div className="bg-green-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-green-600 font-bold">2</span>
                </div>
                <h4 className="font-medium mb-2">Recherchez</h4>
                <p className="text-sm text-gray-600">Entrez le code pour consulter les détails du produit</p>
              </div>
              <div>
                <div className="bg-purple-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-green-600 font-bold">3</span>
                </div>
                <h4 className="font-medium mb-2">Achetez</h4>
                <p className="text-sm text-gray-600">Effectuez votre achat en toute sécurité</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={checkoutOpen}
        onOpenChange={(open) => { if (!checkoutLoading) setCheckoutOpen(open); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Payer en toute sécurité</DialogTitle>
            <DialogDescription>
              Aucun compte à créer. Votre argent est protégé jusqu'à la réception du produit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {searchResult && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{searchResult.name}{quantity > 1 ? ` (${productPrice.toLocaleString()} × ${quantity})` : ''}</span>
                  <span className="text-gray-900">{lineTotal.toLocaleString()} FCFA</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Quantité</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={checkoutLoading || quantity <= 1}
                      aria-label="Diminuer la quantité"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-100 disabled:opacity-40"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center text-base font-bold text-gray-900">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => q + 1)}
                      disabled={checkoutLoading}
                      aria-label="Augmenter la quantité"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-100 disabled:opacity-40"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Frais de protection{protectionFeePct ? ` (${protectionFeePct}%)` : ''}</span>
                  <span className="text-gray-900">{protectionFeeAmount.toLocaleString()} FCFA</span>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-gray-200 pt-1.5">
                  <span className="font-medium text-gray-700">Total à payer</span>
                  <span className="font-semibold text-gray-900">{totalToPay.toLocaleString()} FCFA</span>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Nom complet</label>
              <Input
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="Votre nom"
                disabled={checkoutLoading}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Téléphone (Wave / Orange Money)</label>
              <Input
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
                placeholder="77 123 45 67"
                inputMode="tel"
                disabled={checkoutLoading}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Adresse de livraison</label>
              <Input
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Quartier, ville, point de repère"
                disabled={checkoutLoading}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Moyen de paiement</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPayMethod('wave')}
                  disabled={checkoutLoading}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    payMethod === 'wave'
                      ? 'border-green-600 bg-green-50 text-green-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <img src={waveLogo} alt="" className="h-6 w-6 rounded object-contain" />
                  Wave
                </button>
                <button
                  type="button"
                  onClick={() => setPayMethod('orange_money')}
                  disabled={checkoutLoading}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    payMethod === 'orange_money'
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <img src={orangeMoneyLogo} alt="" className="h-6 w-6 rounded object-contain" />
                  Orange Money
                </button>
              </div>
            </div>

            {checkoutError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {checkoutError}
              </div>
            )}
            {checkoutNotice && (
              <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                {checkoutNotice}
              </div>
            )}

            <Button
              className="w-full btn-buyer text-base py-3"
              onClick={handleGuestCheckout}
              disabled={checkoutLoading}
            >
              {checkoutLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Traitement…
                </>
              ) : (
                `Payer ${searchResult ? totalToPay.toLocaleString() : ''} FCFA`
              )}
            </Button>

            <p className="text-center text-xs text-gray-400">
              🔒 Validèl ne vous demandera jamais votre code secret Wave ou Orange Money.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductSearch;
