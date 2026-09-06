import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, X, Smartphone } from 'lucide-react';

const PWA_INSTALL_SNOOZE_KEY = 'pwa_install_snooze_v1';
const SNOOZE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 jours

const PWAInstallPrompt = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Ne pas afficher sur l'application native
    if (Capacitor.isNativePlatform()) {
      return;
    }

    // Vérifier si le popup a déjà été ignoré
    const snoozeData = localStorage.getItem(PWA_INSTALL_SNOOZE_KEY);
    if (snoozeData) {
      const { expiresAt } = JSON.parse(snoozeData);
      if (Date.now() < expiresAt) {
        setDismissed(true);
        return;
      }
    }

    // Écouter l'événement beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Afficher le popup après un délai de 3 secondes
      setTimeout(() => {
        setIsOpen(true);
      }, 3000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      // Fallback : rediriger vers le site pour installation manuelle
      alert('Pour installer l\'application, utilisez l\'option "Ajouter à l\'écran d\'accueil" de votre navigateur.');
      setIsOpen(false);
      return;
    }

    // Afficher le prompt d'installation PWA natif
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('PWA installée avec succès');
    } else {
      console.log('Installation PWA refusée');
    }
    
    setDeferredPrompt(null);
    setIsOpen(false);
  };

  const handleDismiss = () => {
    // Sauvegarder le snooze
    const snoozeData = {
      expiresAt: Date.now() + SNOOZE_DURATION,
    };
    localStorage.setItem(PWA_INSTALL_SNOOZE_KEY, JSON.stringify(snoozeData));
    setIsOpen(false);
    setDismissed(true);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  if (dismissed || Capacitor.isNativePlatform() || !deferredPrompt) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="bg-green-100 p-3 rounded-full">
              <Smartphone className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">Installer l'application Validel</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2 text-sm">Pourquoi installer l'app ?</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Navigation plus rapide</li>
              <li>• Notifications push en temps réel</li>
              <li>• Expérience utilisateur optimisée</li>
              <li>• Accès hors ligne partiel</li>
            </ul>
          </div>

          <Button
            onClick={handleInstall}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            size="lg"
          >
            <Download className="h-5 w-5 mr-2" />
            Installer l'application
          </Button>
        </div>

        <DialogFooter className="flex-col gap-2">
          <Button
            variant="ghost"
            onClick={handleClose}
            className="w-full"
          >
            Plus tard
          </Button>
          <Button
            variant="ghost"
            onClick={handleDismiss}
            className="w-full text-xs text-gray-500"
          >
            Ne plus afficher
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PWAInstallPrompt;
