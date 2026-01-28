import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';

import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface PaymentWebViewProps {
  url: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (orderId?: string) => void;
  orderId?: string;
}

export const PaymentWebView: React.FC<PaymentWebViewProps> = ({
  url,
  isOpen,
  onClose,
  onSuccess,
  orderId
}) => {
  const [loading, setLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setIframeKey(prev => prev + 1);
    }
  }, [isOpen, url]);

  // Fonction pour vérifier le statut de la commande
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const checkPaymentStatus = async () => {
    if (!orderId) return;
    
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: order } = await supabase
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();

      if (order?.status === 'paid') {
        onSuccess(orderId);
        onClose();
      }
    } catch (error) {
      console.error('Erreur lors de la vérification du paiement:', error);
    }
  };

  // Vérifier le statut toutes les 3 secondes
  useEffect(() => {
    if (!isOpen || !orderId) return;

    const interval = setInterval(() => {
      checkPaymentStatus();
    }, 3000);

    return () => clearInterval(interval);
  }, [checkPaymentStatus, isOpen, orderId]);

  const handleIframeLoad = () => {
    setLoading(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-full h-screen w-screen p-0 m-0">
        <div className="relative w-full h-full flex flex-col">
          {/* Header avec bouton de fermeture */}
          <div className="absolute top-0 left-0 right-0 z-10 bg-green-600 p-4 flex justify-between items-center shadow-md">
            <h3 className="text-white font-semibold text-lg">Paiement sécurisé</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Spinner de chargement */}
          {loading && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <Spinner size="xl" className="text-white" />
            </div>
          )}

          {/* iFrame pour afficher la page de paiement */}
          <iframe
            key={iframeKey}
            src={url}
            className="w-full h-full border-0"
            style={{ marginTop: '60px' }}
            onLoad={handleIframeLoad}
            title="Paiement"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-top-navigation"
          />

          {/* Message d'instruction */}
          <div className="absolute bottom-0 left-0 right-0 bg-blue-50 p-3 text-center text-sm text-blue-800 border-t border-blue-200">
            💡 Complétez votre paiement dans cette fenêtre. Votre commande sera automatiquement mise à jour.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
