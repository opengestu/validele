import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Smartphone } from 'lucide-react';

const AppInstall = () => {
  const androidPackageName = import.meta.env.VITE_ANDROID_APP_PACKAGE || 'com.validele.app';
  const playStoreUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(androidPackageName)}`;
  const iosStoreUrl = import.meta.env.VITE_IOS_APP_STORE_URL || '';

  const handleInstallAndroid = () => {
    if (typeof window !== 'undefined') {
      window.open(playStoreUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleInstallIos = () => {
    if (typeof window !== 'undefined' && iosStoreUrl) {
      window.open(iosStoreUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    alert('La version iOS n\'est pas encore disponible sur l\'App Store.');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center px-4">
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-green-100 p-4 rounded-full">
              <Smartphone className="h-12 w-12 text-green-600" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">Télécharger Validel</CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            Téléchargez l'application pour une expérience optimale
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">Pourquoi télécharger l'app ?</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Navigation plus rapide</li>
              <li>• Notifications push en temps réel</li>
              <li>• Expérience utilisateur optimisée</li>
              <li>• Accès hors ligne partiel</li>
            </ul>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <Button
              onClick={handleInstallAndroid}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-4 text-lg"
            >
              <Download className="h-5 w-5 mr-2" />
              Télécharger pour Android
            </Button>

            <Button
              onClick={handleInstallIos}
              disabled={!iosStoreUrl}
              className="w-full bg-gray-800 hover:bg-gray-900 text-white py-4 text-lg"
              variant={iosStoreUrl ? "default" : "outline"}
            >
              <Download className="h-5 w-5 mr-2" />
              Télécharger pour iOS
              {!iosStoreUrl && " (Bientôt disponible)"}
            </Button>
          </div>

          {!iosStoreUrl && (
            <p className="text-center text-xs text-gray-500">
              La version iOS sera bientôt disponible sur l'App Store.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AppInstall;
