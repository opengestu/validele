import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Search, ShoppingCart, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const SHARED_PRODUCT_PENDING_CODE_KEY = 'pending_shared_product_code';

const ProductSearch = () => {
  const { code: codeFromUrl } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const { userProfile, loading: authLoading } = useAuth();
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

  useEffect(() => {
    if (!codeFromUrl) return;
    const decodedCode = decodeURIComponent(codeFromUrl).trim();
    if (!decodedCode) return;

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
                  {searchResult.image_url ? (
                    <img 
                      src={searchResult.image_url} 
                      alt={searchResult.name}
                      className="w-full h-64 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-full h-64 bg-gray-200 rounded-lg flex items-center justify-center">
                      <span className="text-gray-500">Aucune image</span>
                    </div>
                  )}
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
                      <Link
                        to={(() => {
                          const rawCode = String(searchResult?.code || searchCode || '').trim();
                          return rawCode ? `/buyer?productCode=${encodeURIComponent(rawCode)}` : '/buyer';
                        })()}
                        onClick={() => {
                          const rawCode = String(searchResult?.code || searchCode || '').trim();
                          persistPendingProductCode(rawCode);
                        }}
                      >
                        <Button
                          className="w-full btn-buyer text-lg py-3"
                          disabled={!searchResult.is_available}
                        >
                          <ShoppingCart className="h-5 w-5 mr-2" />
                          {searchResult.is_available ? 'Acheter maintenant' : 'Produit inactif'}
                        </Button>
                      </Link>
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
    </div>
  );
};

export default ProductSearch;
