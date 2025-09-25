/* eslint-disable @typescript-eslint/no-unused-expressions */
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, QrCode, CheckCircle, AlertCircle, Camera, Package, Info, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Html5Qrcode } from 'html5-qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';

function Html5QrcodeReact({ onScan, onError }) {
  const divId = 'qr-reader-react';
  const html5Qr = useRef(null);
  const [scanPaused, setScanPaused] = useState(false);
  // Détection mobile
  const isMobile = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);
  const qrboxSize = isMobile ? 140 : 200;
  useEffect(() => {
    let isMounted = true;
    try {
      html5Qr.current = new Html5Qrcode(divId);
      Html5Qrcode.getCameras().then(cameras => {
        if (!isMounted) return;
        const cameraId = cameras && cameras[0] && cameras[0].id;
        if (!cameraId) {
          onError('Aucune caméra détectée');
          return;
        }
        html5Qr.current.start(
          cameraId,
          {
            fps: 20,
            qrbox: qrboxSize,
            videoConstraints: {
              facingMode: "environment",
              width: { ideal: 640 },
              focusMode: "continuous" // autofocus si supporté
            }
          },
          (decodedText) => {
            if (scanPaused) return;
            setScanPaused(true);
            onScan(decodedText);
            setTimeout(() => setScanPaused(false), 2000); // 2s de pause
          },
          (err) => {
            // ignore scan errors
          }
        ).catch(err => {
          onError('Erreur lors de l\'accès à la caméra : ' + err);
        });
      }).catch(err => {
        onError('Erreur lors de la détection de la caméra : ' + err);
      });
    } catch (err) {
      onError('Erreur critique lors de l\'initialisation du scanner : ' + err);
    }
    return () => {
      isMounted = false;
      if (html5Qr.current) {
        try {
          html5Qr.current.stop().then(() => {
            html5Qr.current.clear();
          }).catch(() => {
            // Ignore si déjà stoppé
            html5Qr.current.clear();
          });
        } catch (e) {
          // Ignore toute erreur de stop
          html5Qr.current.clear && html5Qr.current.clear();
        }
      }
    };
  }, [onScan, onError, qrboxSize, scanPaused]);
  return (
    <>
      <style>{`
        /* Video styling */
        #${divId} video {
          object-fit: cover !important;
          width: 100% !important;
          height: auto !important;
          max-width: 360px;
          margin: 0 auto;
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(79, 70, 229, 0.15);
        }
        #${divId} { display: flex; justify-content: center; align-items: center; position: relative; }
      `}</style>
      <div
        id={divId}
        style={{ width: isMobile ? 240 : 360, margin: '0 auto' }}
      />
    </>
  );
}

function QRScanSection({
  scannedCode,
  setScannedCode,
  handleScanQR,
  validationResult,
  handleConfirmDelivery,
  resetScan,
  isConfirmingDelivery
}) {
  const [cameraError, setCameraError] = useState(false);
  const [cameraErrorMsg, setCameraErrorMsg] = useState('');
  const [hasScanned, setHasScanned] = useState(false);

  const handleScan = (decodedText) => {
    console.log('handleScan appelé, decodedText =', decodedText);
    setScannedCode(decodedText);
    handleScanQR(decodedText, () => setHasScanned(false));
    setHasScanned(true); // Masquer le scanner dès qu'un code est détecté
  };
  const handleError = (err) => {
    setCameraError(true);
    setCameraErrorMsg(typeof err === 'string' ? err : 'Erreur d\'accès à la caméra. Vérifiez les permissions ou réessayez.');
  };

  // Détermine si le scan est validé
  const scanValid = validationResult && validationResult.status === 'valid';

  return (
    <Card className="mb-8 rounded-3xl border-0 bg-white/80 backdrop-blur shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center text-xl">
          <QrCode className="h-5 w-5 mr-2 text-purple-600" />
          <span className="bg-gradient-to-r from-purple-600 to-sky-600 bg-clip-text text-transparent">Scanner de validation</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Scanner et champ manuel masqués si scan validé OU si un code a été scanné */}
          <div
            className={`rounded-2xl p-6 sm:p-8 text-center transition-opacity duration-300 ${(scanValid || hasScanned) ? 'opacity-0 pointer-events-none h-0 p-0 m-0' : 'opacity-100'} bg-gradient-to-br from-indigo-50 to-sky-50 ring-1 ring-indigo-100`}
            style={{ minHeight: (scanValid || hasScanned) ? 0 : 220 }}
          >
            {!cameraError && !scanValid && !hasScanned ? (
              <Html5QrcodeReact onScan={handleScan} onError={handleError} />
            ) : null}
            {!scanValid && !hasScanned && (
              <>
                <p className="text-gray-700 mt-4">Scannez le QR code du client avec la caméra</p>
                <p className="text-xs text-gray-500 mt-1">Astuce : placez le QR code bien au centre du cadre et assurez-vous d'une bonne lumière pour accélérer la détection.</p>
              </>
            )}
            {cameraError && !scanValid && !hasScanned && (
              <div className="mt-4 flex flex-col items-center gap-2">
                <p className="text-red-600 mt-2 text-sm">{cameraErrorMsg || "Impossible d'accéder à la caméra. Autorisez l'accès ou réessayez."}</p>
                <Button variant="outline" className="border-indigo-300 text-indigo-700 hover:bg-indigo-50" onClick={() => { setCameraError(false); setCameraErrorMsg(''); setHasScanned(false); }}>Réessayer</Button>
              </div>
            )}
          </div>
          {/* Bloc de validation avec effet fondu */}
          <div className={`transition-opacity duration-300 ${scanValid ? 'opacity-100' : 'opacity-0 pointer-events-none h-0 p-0 m-0'} flex items-center justify-center min-h-[220px]`}
            style={{ minHeight: scanValid ? 220 : 0 }}>
            {validationResult && validationResult.status === 'valid' && (
              <div className="flex flex-col items-center justify-center gap-5 w-full bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-6 ring-1 ring-emerald-100">
                <div className="flex items-center gap-2 text-emerald-700 text-center">
                  <CheckCircle className="h-6 w-6 text-emerald-600" />
                  <span className="font-semibold text-lg">QR code valide et correspond à la commande</span>
                </div>
                <Button
                  className="bg-gradient-to-r from-purple-600 to-sky-600 hover:from-purple-700 hover:to-sky-700 text-white mt-2"
                  disabled={isConfirmingDelivery}
                  onClick={async () => {
                    await handleConfirmDelivery();
                  }}
                >
                  {isConfirmingDelivery ? (
                    <span className="inline-flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirmation…</span>
                  ) : (
                    'Confirmer la commande'
                  )}
                </Button>
              </div>
            )}
          </div>
          {/* Bloc d'erreur reste inchangé */}
          {validationResult && validationResult.status === 'invalid' && (
            <div className="flex items-center gap-2 text-red-700 mt-6 bg-red-50 rounded-xl p-3 ring-1 ring-red-100">
              <AlertCircle className="h-6 w-6 text-red-600" />
              <span className="font-semibold">QR code invalide : {validationResult.error}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const QRScanner = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [scannedCode, setScannedCode] = useState('');
  const [orderCode, setOrderCode] = useState('');
  const [validationResult, setValidationResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [showScanSection, setShowScanSection] = useState(false);
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [isConfirmingDelivery, setIsConfirmingDelivery] = useState(false);
  const [isPayoutInProgress, setIsPayoutInProgress] = useState(false);

  // Mapper d'erreurs PayDunya vers messages plus clairs
  const mapPaydunyaError = (raw: unknown): string => {
    const msg = typeof raw === 'string' ? raw : JSON.stringify(raw || '');
    const lower = msg.toLowerCase();
    if (lower.includes('callback')) {
      return 'URL de callback inaccessible. Vérifiez votre tunnel HTTPS (ex: ngrok) et la variable PAYDUNYA_CALLBACK_URL.';
    }
    if (lower.includes('insufficient') || lower.includes('fond') || lower.includes('fund')) {
      return 'Fonds insuffisants pour effectuer le paiement vendeur.';
    }
    if (lower.includes('alias') || lower.includes('account') || lower.includes('numero') || lower.includes('numéro')) {
      return 'Compte bénéficiaire (alias/numéro) invalide ou non supporté pour le mode de retrait.';
    }
    return msg;
  };

  // Si on arrive avec ?orderId=..., on précharge la commande et ouvre le flux de scan
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('orderId');
    if (!orderId || !user?.id) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select(`*, products(name, code), buyer_profile:profiles!orders_buyer_id_fkey(full_name)`) 
          .eq('id', orderId)
          .maybeSingle();
        if (!error && data) {
          setCurrentOrder(data);
          // Si la commande est déjà en cours et assignée au livreur, on amène l'utilisateur au scan
          if (data.status === 'in_delivery' && data.delivery_person_id === user.id) {
            setOrderModalOpen(false);
            setShowScanSection(true);
          } else if (data.status === 'paid') {
            // Sinon, on laisse la modale proposer de commencer la livraison
            setOrderModalOpen(true);
          }
        }
      } catch (e) {
        // silencieux
      }
    })();
  }, [user?.id]);

  // Recherche de la commande par code commande
  const handleSearchOrder = async () => {
    if (!orderCode.trim()) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer un code de commande",
        variant: "destructive",
      });
      return;
    }

    try {
      console.log('Recherche de la commande avec le code:', orderCode.toUpperCase());
      
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          products(name, code),
          buyer_profile:profiles!orders_buyer_id_fkey(full_name)
        `)
        .ilike('order_code', orderCode.trim().replace(/\s/g, '').toUpperCase())
        .in('status', ['paid', 'in_delivery'])
        .maybeSingle();

      console.log('Résultat de la recherche:', { data, error });

      if (error) {
        console.error('Erreur lors de la recherche:', error);
        throw error;
      }

      if (data) {
        setCurrentOrder(data);
        console.log('Commande trouvée:', data);
        toast({
          title: "Commande trouvée",
          description: `Commande ${data.order_code} prête pour livraison`,
        });
      } else {
        console.log('Aucune commande trouvée avec le code:', orderCode.toUpperCase());
        setCurrentOrder(null);
        toast({
          title: "Commande non trouvée",
          description: "Aucune commande payée trouvée avec ce code. Vérifiez que la commande est bien payée.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Erreur lors de la recherche de commande:', error);
      setCurrentOrder(null);
      toast({
        title: "Erreur de recherche",
        description: "Une erreur s'est produite lors de la recherche de la commande",
        variant: "destructive",
      });
    }
  };

  const handleStartDelivery = async () => {
    if (!currentOrder) return;

    try {
      console.log('Démarrage de la livraison pour la commande:', currentOrder.id);
      
      const { error } = await supabase
        .from('orders')
        .update({ 
          status: 'in_delivery',
          delivery_person_id: user.id
        })
        .eq('id', currentOrder.id);

      if (error) {
        console.error('Erreur lors du démarrage de la livraison:', error);
        throw error;
      }

      setCurrentOrder({ ...currentOrder, status: 'in_delivery', delivery_person_id: user.id });
      
      console.log('Livraison démarrée avec succès');
      toast({
        title: "Livraison démarrée",
        description: "Vous pouvez maintenant vous rendre chez le client",
      });
    } catch (error) {
      console.error('Erreur lors du démarrage de la livraison:', error);
      toast({
        title: "Erreur",
        description: "Impossible de démarrer la livraison",
        variant: "destructive",
      });
    }
  };

  const handleScanQR = async (code, resetScan) => {
    const codeToCheck = code !== undefined ? code : scannedCode;
    console.log('handleScanQR appelé, codeToCheck =', codeToCheck);
    if (!codeToCheck.trim()) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer ou scanner un code QR",
        variant: "destructive",
      });
      return;
    }

    if (!currentOrder) {
      toast({
        title: "Erreur",
        description: "Veuillez d'abord sélectionner une commande",
        variant: "destructive",
      });
      return;
    }

    try {
      console.log('QRScanner: code scanné =', codeToCheck, 'QR attendu =', currentOrder.qr_code);
      // Vérifier que le QR code correspond à la commande en cours
      if (codeToCheck !== currentOrder.qr_code) {
        throw new Error('QR code ne correspond pas à la commande');
      }
      // Vérifier que c'est bien le livreur assigné
      if (currentOrder.delivery_person_id !== user.id) {
        throw new Error('Vous n\'êtes pas le livreur assigné à cette commande');
      }
      setValidationResult({
        ...currentOrder,
        status: 'valid',
        timestamp: new Date().toLocaleString()
      });
      console.log('QRScanner: validation OK, commande id =', currentOrder.id);
      toast({
        title: "QR Code valide",
        description: `Livraison confirmée pour ${currentOrder.buyer_profile?.full_name}`,
      });
      // Ne pas fermer la section ici
      // setShowScanSection(false);
      // setScannedCode('');
    } catch (error) {
      let errorMessage = 'Erreur inconnue';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      setValidationResult({
        status: 'invalid',
        code: codeToCheck,
        timestamp: new Date().toLocaleString(),
        error: errorMessage
      });
      console.error('QRScanner: validation échouée', errorMessage);
      toast({
        title: "QR Code invalide",
        description: errorMessage || "Ce code QR n'est pas valide",
        variant: "destructive",
      });
      if (resetScan) resetScan(); // Réaffiche le scanner si code invalide
      // Fermer la section seulement si tu veux masquer après échec, sinon laisse ouvert
      // setShowScanSection(false);
      // setScannedCode('');
    }
  };

  const handleConfirmDelivery = async () => {
    if (validationResult && validationResult.status === 'valid') {
      try {
        setIsConfirmingDelivery(true);
        console.log('QRScanner: confirmation livraison, id =', validationResult.id);
        const { error, data } = await supabase
          .from('orders')
          .update({ 
            status: 'delivered',
            delivered_at: new Date().toISOString()
          })
          .eq('id', validationResult.id)
          .select();
        console.log('QRScanner: résultat update delivered', { error, data });
        if (error) throw error;

        // 1) Feedback immédiat de succès pour l'utilisateur
        toast({
          title: "Livraison confirmée",
          description: "Validation effectuée. Paiement vendeur en cours…",
        });

        // 2) Mettre à jour l'UI tout de suite (pas d'attente du paiement vendeur)
        setValidationResult(null);
        setScannedCode('');
        setOrderCode('');
        setShowScanSection(false);
        setDeliveryConfirmed(true);

        // 3) Déclencher le paiement vendeur en arrière-plan (non bloquant)
        (async () => {
          try {
            setIsPayoutInProgress(true);
            const response = await fetch('/api/order/scan', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId: validationResult.id }),
            });
            const result = await response.json();
            if (result.success) {
              toast({
                title: "Paiement vendeur déclenché",
                description: "Le paiement a été initié avec succès.",
              });
            } else {
              toast({
                title: "Erreur PayDunya",
                description: mapPaydunyaError(result.error || result.response_text || result.message || 'Erreur paiement vendeur'),
                variant: "destructive",
              });
            }
          } catch (err: unknown) {
            let errorMessage = 'Erreur réseau PayDunya';
            if (err instanceof Error) {
              errorMessage = err.message;
            }
            toast({
              title: "Erreur réseau PayDunya",
              description: mapPaydunyaError(errorMessage || 'Impossible de contacter le serveur pour le paiement vendeur.'),
              variant: "destructive",
            });
          } finally {
            // On peut nettoyer la commande courante après
            setCurrentOrder(null);
            setIsPayoutInProgress(false);
          }
        })();

        setIsConfirmingDelivery(false);
      } catch (error: unknown) {
        let errorMessage = 'Erreur inconnue';
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        console.error('QRScanner: erreur update delivered', errorMessage);
        toast({
          title: "Erreur",
          description: "Impossible de confirmer la livraison : " + errorMessage,
          variant: "destructive",
        });
        setIsConfirmingDelivery(false);
      }
    }
  };

  useEffect(() => {
    if (showScanSection && currentOrder) {
      setIsScanning(true);
      setTimeout(() => {
        setScannedCode(currentOrder.qr_code);
        setIsScanning(false);
        toast({
          title: "QR Code scanné",
          description: "Code QR détecté automatiquement",
        });
      }, 2000);
    }
    // eslint-disable-next-line
  }, [showScanSection]);

  // Ouvre la modal quand une commande est trouvée
  useEffect(() => {
    if (currentOrder) {
      setOrderModalOpen(true);
    }
  }, [currentOrder]);

  // Redirection automatique après succès
  useEffect(() => {
    if (!deliveryConfirmed) return;
    const t = setTimeout(() => navigate('/delivery'), 3000);
    return () => clearTimeout(t);
  }, [deliveryConfirmed, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-sky-100 flex flex-col items-center py-8 px-2 sm:px-0">
      {/* Bandeau de progression paiement vendeur */}
      {isPayoutInProgress && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <div className="mx-auto max-w-2xl mt-2 px-4">
            <div className="rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 text-white shadow-lg px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Paiement vendeur en cours…</span>
              </div>
              <span className="text-white/80 text-sm">Vous pouvez continuer</span>
            </div>
          </div>
        </div>
      )}
      {/* Header modernisé */}
      <div className="w-full max-w-2xl flex items-center gap-2 mb-8">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-indigo-100 transition" title="Retour au dashboard livreur">
          <ArrowLeft className="h-6 w-6 text-indigo-600" />
        </button>
        <h1 className="text-2xl sm:text-3xl font-extrabold flex items-center gap-2 text-gray-900">
          <QrCode className="h-7 w-7 text-purple-600" />
          <span className="bg-gradient-to-r from-purple-700 to-sky-700 bg-clip-text text-transparent">Scanner QR Code</span>
        </h1>
      </div>

      {/* Modal de détails commande */}
      <Dialog open={orderModalOpen && !!currentOrder && !showScanSection && !deliveryConfirmed} onOpenChange={setOrderModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{currentOrder?.products?.name}</DialogTitle>
            <DialogDescription>
              <div className="flex flex-col gap-1 mt-2">
                <span className="font-semibold">Client:</span> {currentOrder?.buyer_profile?.full_name}<br />
                <span className="font-semibold">Adresse:</span> {currentOrder?.delivery_address}<br />
                <span className="font-semibold">Téléphone:</span> {currentOrder?.buyer_phone}<br />
                <span className="font-semibold">Code commande:</span> <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded">{currentOrder?.order_code}</span>
              </div>
            </DialogDescription>
          </DialogHeader>
          {currentOrder?.status === 'paid' && (
            <Button onClick={handleStartDelivery} className="w-full bg-blue-600 hover:bg-blue-700 mb-2">Commencer la livraison</Button>
          )}
          {currentOrder?.status === 'in_delivery' && currentOrder?.delivery_person_id === user?.id && (
            <div className="text-center mt-2">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-green-700 font-semibold text-lg">Livraison en cours</span>
              </div>
              <p className="text-gray-600 mb-4">Vous pouvez maintenant scanner le QR code du client</p>
              <Button className="bg-purple-600 hover:bg-purple-700 mb-4" onClick={() => { setShowScanSection(true); setOrderModalOpen(false); }}>
                <Camera className="h-4 w-4 mr-2" /> Scanner le QR code
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {deliveryConfirmed ? (
          <div className="w-full bg-white/80 backdrop-blur rounded-3xl shadow-xl p-8 flex flex-col items-center ring-1 ring-emerald-100">
            <CheckCircle className="h-16 w-16 text-emerald-600 mb-4" />
            <h2 className="text-2xl font-bold text-emerald-700 mb-2">Commande livrée et confirmée !</h2>
            <p className="text-emerald-800 text-lg mb-2 text-center">La livraison a bien été validée. Les fonds seront transférés au vendeur sous 24h.</p>
            <Button className="mt-4 bg-gradient-to-r from-purple-600 to-sky-600 hover:from-purple-700 hover:to-sky-700 text-white" onClick={() => navigate('/delivery')}>Retour au dashboard</Button>
            <p className="text-sm text-gray-500 mt-2">Redirection automatique dans 3 secondes…</p>
          </div>
        ) : !showScanSection ? (
          <>
            {/* Recherche et infos commande */}
            <div className="w-full max-w-2xl bg-white/80 backdrop-blur rounded-3xl shadow-xl p-6 mb-8 flex flex-col gap-4 items-center ring-1 ring-indigo-100">
              <div className="flex items-center gap-3 mb-2">
                <Package className="h-6 w-6 text-purple-500" />
                <span className="text-lg font-semibold text-gray-900">Rechercher une commande</span>
              </div>
              <div className="w-full flex flex-col sm:flex-row gap-2 items-center">
                <input
                  type="text"
                  className="flex-1 rounded-xl px-4 py-2 text-lg bg-white border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-400"
                  placeholder="Ex: CMD001"
                  value={orderCode}
                  onChange={e => setOrderCode(e.target.value)}
                />
                <Button className="bg-gradient-to-r from-purple-600 to-sky-600 hover:from-purple-700 hover:to-sky-700 text-white px-6 py-2 rounded-xl text-lg" onClick={handleSearchOrder}>
                  Rechercher
                </Button>
              </div>
            </div>

            {/* Instructions modernisées */}
            <div className="w-full max-w-2xl bg-white/80 backdrop-blur rounded-3xl shadow p-6 mb-8 ring-1 ring-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <Info className="h-5 w-5 text-indigo-400" />
                <span className="text-lg font-semibold text-gray-800">Instructions d'utilisation</span>
              </div>
              <ol className="list-decimal list-inside space-y-2 text-gray-700 text-base pl-2">
                <li><span className="font-medium">Récupérez le code de commande</span> auprès du vendeur</li>
                <li><span className="font-medium">Recherchez la commande</span> et démarrez la livraison</li>
                <li><span className="font-medium">Rendez-vous chez le client</span> à l'adresse indiquée</li>
                <li><span className="font-medium">Demandez au client de présenter son QR code</span></li>
                <li><span className="font-medium">Scannez le code</span> pour valider et libérer les fonds</li>
              </ol>
              <div className="mt-4 text-blue-700 text-sm font-medium">
                <span className="font-bold">Note :</span> Les fonds seront automatiquement transférés au vendeur dans les 24h
              </div>
            </div>
          </>
        ) : (
          <QRScanSection
            scannedCode={scannedCode}
            setScannedCode={setScannedCode}
            handleScanQR={handleScanQR}
            validationResult={validationResult}
            handleConfirmDelivery={handleConfirmDelivery}
            resetScan={() => {}}
            isConfirmingDelivery={isConfirmingDelivery}
          />
        )}
        {/* Résultat de validation déjà inclus dans QRScanSection */}
      </div>
    </div>
  );
};

export default QRScanner;
