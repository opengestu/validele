import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search, ShoppingCart, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Product } from '@/types/database';

const ProductSearch = () => {
  const [searchCode, setSearchCode] = useState('');
  const [searchResult, setSearchResult] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!searchCode.trim()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          profiles(full_name, company_name)
        `)
        .eq('code', searchCode.toLowerCase())
        .eq('is_available', true)
        .single();

      if (error) throw error;
      setSearchResult(data);
    } catch (error) {
      setSearchResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            <Link to="/">
              <ArrowLeft className="h-6 w-6 text-gray-600 hover:text-blue-600" />
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
                onChange={(e) => setSearchCode(e.target.value)}
                className="flex-1"
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button 
                onClick={handleSearch}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700"
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
                    <span className="text-sm text-green-600 font-medium">Produit vérifié</span>
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
                      <span className="text-green-600 font-medium">En stock</span>
                    </div>
                  </div>
                  
                  <div className="border-t pt-6">
                    <p className="text-4xl font-bold text-blue-600 mb-6">
                      {searchResult.price.toLocaleString()} FCFA
                    </p>
                    
                    <Link to="/buyer">
                      <Button className="w-full bg-green-600 hover:bg-green-700 text-lg py-3">
                        <ShoppingCart className="h-5 w-5 mr-2" />
                        Acheter maintenant
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : searchCode && !loading && (
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
                  <span className="text-blue-600 font-bold">1</span>
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
                  <span className="text-purple-600 font-bold">3</span>
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
