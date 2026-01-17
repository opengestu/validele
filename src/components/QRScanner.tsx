/* eslint-disable @typescript-eslint/no-unused-expressions */
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QrCode, CheckCircle, AlertCircle, Camera, Package, Info, Loader2 } from 'lucide-react';
import valideLogo from '@/assets/validel-logo.png';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { toFrenchErrorMessage } from '@/lib/errors';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Html5Qrcode } from 'html5-qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { apiUrl } from '@/lib/api';
import { notifyBuyerDeliveryStarted, notifyDeliveryCompleted } from '@/services/notifications';

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
  isConfirmingDelivery,
  matchInfo
}) {
  // matchInfo: { type: 'order_code'|'qr_code'|'partial', code: string } | null
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
          <QrCode className="h-5 w-5 mr-2 text-green-600" />
          <span className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">Scanner de validation</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Scanner et champ manuel masqués si scan validé OU si un code a été scanné */}
          <div
            className={`rounded-2xl p-6 sm:p-8 text-center transition-opacity duration-300 ${(scanValid || hasScanned) ? 'opacity-0 pointer-events-none h-0 p-0 m-0' : 'opacity-100'} bg-gradient-to-br from-indigo-50 to-sky-50 ring-1 ring-indigo-100`}
            style={{ minHeight: (scanValid || hasScanned) ? 0 : 220 }}
          >
            {/* Si on a déjà trouvé une correspondance via recherche manuelle, afficher une instruction */}
            {matchInfo && !scanValid && !hasScanned && (
              <div className="mb-4 text-left bg-white/60 p-3 rounded-md">
                <p className="text-sm font-medium text-gray-800">✅ Commande {matchInfo.type === 'order_code' ? matchInfo.code : 'trouvée'}</p>
                <p className="text-xs text-gray-600 mt-1">Veuillez maintenant scanner le <strong>QR code sécurisé</strong> présenté par le client pour valider la livraison.</p>
                <div className="mt-3">
                  <Button variant="outline" onClick={() => { setHasScanned(false); resetScan && resetScan(); }}>
                    Scanner maintenant
                  </Button>
                </div>
              </div>
            )}
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
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white mt-2"
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
  const [lastMatchInfo, setLastMatchInfo] = useState<{ type: 'order_code'|'qr_code'|'partial', code: string } | null>(null);
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
      return 'Fonds insuffisants pour effectuer le paiement vendeur(se).';
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
          .select(`*, products(name, code), buyer_profile:profiles!orders_buyer_id_fkey(full_name), vendor_profile:profiles!orders_vendor_id_fkey(phone, wallet_type)`) 
          .eq('id', orderId)
          .maybeSingle();
        if (!error && data) {
          setCurrentOrder(data);
          console.log('Commande chargée depuis URL:', { 
            id: data.id, 
            vendor_id: data.vendor_id,
            buyer_id: data.buyer_id,
            vendor_profile: data.vendor_profile,
            toutes_les_données: data
          });
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
      // Normalize input: remove spaces/dashes and uppercase for robust matching
      const cleaned = orderCode.trim().replace(/[^a-z0-9]/gi, '').toUpperCase();
      console.log('Recherche de la commande avec le code (nettoyé):', cleaned);
      const pattern = `%${cleaned}%`;

      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          products(name, code),
          buyer_profile:profiles!orders_buyer_id_fkey(full_name),
          vendor_profile:profiles!orders_vendor_id_fkey(phone, wallet_type)
        `)
        .or(`order_code.ilike.${pattern},qr_code.ilike.${pattern}`)
        .in('status', ['paid', 'in_delivery'])
        .maybeSingle();

      console.log('Résultat de la recherche:', { data, error });

      if (error) {
        console.error('Erreur lors de la recherche:', error);
        throw error;
      }

      if (data) {
        setCurrentOrder(data);
        // Déterminer si la correspondance vient de order_code ou qr_code
        const normalize = (s) => (s||'').toString().replace(/[^a-z0-9]/gi,'').toUpperCase();
        const cleaned = orderCode.trim().replace(/[^a-z0-9]/gi,'').toUpperCase();
        const orderCodeNorm = normalize(data.order_code);
        const qrNorm = normalize(data.qr_code);
        let matchType: 'order_code' | 'qr_code' | 'partial' = 'partial';
        if (orderCodeNorm && orderCodeNorm === cleaned) matchType = 'order_code';
        else if (qrNorm && qrNorm === cleaned) matchType = 'qr_code';
        else if (orderCodeNorm && orderCodeNorm.includes(cleaned)) matchType = 'order_code';
        else if (qrNorm && qrNorm.includes(cleaned)) matchType = 'qr_code';

        setLastMatchInfo({ type: matchType, code: (matchType === 'qr_code' && data.qr_code) ? data.qr_code : data.order_code || '' });
        
        console.log('Commande trouvée:', data, 'matchType:', matchType, 'statut:', data.status);
        
        // Afficher le modal avec les détails de la commande (pas le scan directement)
        setOrderModalOpen(true);
        
        toast({
          title: "Commande trouvée",
          description: `Commande ${data.order_code} trouvée. Cliquez sur "Commencer à livrer" pour démarrer.`,
        });
      } else {
        console.log('Aucune commande trouvée avec le code:', orderCode.toUpperCase());
        setCurrentOrder(null);
        setLastMatchInfo(null);
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
      
      // Notifier l'acheteur que la livraison est en cours
      notifyBuyerDeliveryStarted(
        currentOrder.buyer_id,
        currentOrder.id,
        currentOrder.order_code || undefined
      ).catch(err => console.warn('Notification livraison démarrée échouée:', err));
      
      console.log('Livraison démarrée avec succès');
      
      // Fermer le modal et afficher le message + section de scan
      setOrderModalOpen(false);
      setShowScanSection(true);
      
      toast({
        title: "Livraison en cours",
        description: "Veuillez scanner le QR code du client pour valider la livraison",
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
      // Normaliser les codes (supprimer espaces, tirets et non-alphanumériques, mettre en majuscule)
      const normalize = (s) => (s || '').toString().replace(/[^a-z0-9]/gi, '').toUpperCase();
      const scannedNormalized = normalize(codeToCheck);
      const expectedNormalized = normalize(currentOrder.qr_code);
      // Vérifier que le QR code correspond à la commande en cours
      if (scannedNormalized !== expectedNormalized) {
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
      console.log('QRScanner: validation OK, commande id =', currentOrder.id, 'vendor_profile:', currentOrder.vendor_profile);
      toast({
        title: "QR Code valide",
        description: `Livraison confirmée pour ${currentOrder.buyer_profile?.full_name}`,
      });
      // Ne pas fermer la section ici
      // setShowScanSection(false);
      // setScannedCode('');
    } catch (error) {
      const errorMessage = toFrenchErrorMessage(error, 'Erreur inconnue');
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
        console.log('QRScanner: vendor_id =', validationResult.vendor_id);
        
        // 1) Marquer la commande comme delivered
        const { error: updateError, data: updatedOrders } = await supabase
          .from('orders')
          .update({ 
            status: 'delivered',
            delivered_at: new Date().toISOString()
          })
          .eq('id', validationResult.id)
          .select();
        
        console.log('QRScanner: résultat update delivered', { error: updateError, data: updatedOrders });
        
        if (updateError) {
          console.error('QRScanner: ERREUR mise à jour statut delivered:', updateError);
          throw new Error(`Erreur mise à jour statut: ${updateError.message}`);
        }
        
        if (!updatedOrders || updatedOrders.length === 0) {
          throw new Error('Commande non mise à jour - aucune donnée retournée. Vérifiez les politiques RLS.');
        }
        
        const updatedOrder = updatedOrders[0];
        console.log('QRScanner: ✅ Statut mis à jour avec succès - Commande livrée:', updatedOrder.status);

        // Notifier vendeur + acheteur que la livraison est terminée
        notifyDeliveryCompleted(
          validationResult.vendor_id,
          validationResult.buyer_id,
          validationResult.id,
          validationResult.order_code || undefined
        ).catch(err => console.warn('Notification livraison terminée échouée:', err));

        // 2) Afficher message de succès immédiat
        toast({
          title: "✅ Livraison validée",
          description: "La commande a été marquée comme livrée. Paiement vendeur en cours…",
        });

        // 3) Déclencher le paiement vendeur
        toast({
          title: "Livraison confirmée",
          description: "Paiement vendeur en cours…",
        });

        setIsPayoutInProgress(true);

        // 3) Récupérer le profil vendeur DIRECTEMENT par vendor_id
        console.log('[PAYOUT] Récupération profil vendeur par vendor_id:', validationResult.vendor_id);
        
        const { data: vendorProfile, error: vendorError } = await supabase
          .from('profiles')
          .select('phone, wallet_type, full_name')
          .eq('id', validationResult.vendor_id)
          .maybeSingle();
        
        console.log('[PAYOUT] Résultat requête vendeur:', { vendorProfile, vendorError });

        if (vendorError) {
          throw new Error(`Erreur récupération vendeur: ${vendorError.message}`);
        }

        if (!vendorProfile) {
          throw new Error(`Profil vendeur non trouvé pour vendor_id: ${validationResult.vendor_id}`);
        }

        console.log('[PAYOUT] Profil vendeur trouvé:', vendorProfile);

        if (!vendorProfile.phone) {
          throw new Error(`Numéro de téléphone manquant pour le vendeur ${vendorProfile.full_name || validationResult.vendor_id}`);
        }

        if (!vendorProfile.wallet_type) {
          throw new Error(`Type de portefeuille non configuré pour le vendeur ${vendorProfile.full_name || validationResult.vendor_id}`);
        }

        // 4) Envoyer le paiement au vendeur
        try {
          // Calculer montant vendeur (95% du total)
          const montantVendeur = Math.round(validationResult.total_amount * 0.95);

          console.log('[PAYOUT] Envoi paiement à:', {
            phone: vendorProfile.phone,
            amount: montantVendeur,
            walletType: vendorProfile.wallet_type
          });

          const response = await fetch(apiUrl('/api/payment/pixpay/payout'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              amount: montantVendeur,
              phone: vendorProfile.phone,
              orderId: validationResult.id,
              type: 'vendor_payout',
              walletType: vendorProfile.wallet_type
            }),
          });
          
          const result = await response.json();
          console.log('[PAYOUT] Résultat API:', result);
          
          if (result.success) {
            // Succès de l'initiation - afficher info et attendre validation vendeur
            setValidationResult(null);
            setScannedCode('');
            setOrderCode('');
            setShowScanSection(false);
            setDeliveryConfirmed(true);
            setCurrentOrder(null);
            
            // Message selon si on a un lien SMS ou pas
            const paymentMessage = result.sms_link 
              ? `Paiement de ${montantVendeur} FCFA initié. Le vendeur ${vendorProfile.full_name} doit valider le SMS envoyé à ${vendorProfile.phone}`
              : `Paiement de ${montantVendeur} FCFA envoyé au vendeur ${vendorProfile.full_name} via ${vendorProfile.wallet_type === 'wave-senegal' ? 'Wave' : 'Orange Money'}. Transaction: ${result.transaction_id}`;
            
            toast({
              title: "✅ Livraison confirmée !",
              description: paymentMessage,
              duration: 8000, // 8 secondes pour lire
            });

            // Log pour debug
            console.log('[PAYOUT] Transaction initiée:', {
              transaction_id: result.transaction_id,
              sms_link: result.sms_link,
              message: result.message
            });
            
            // Marquer comme confirmé pour redirection
            console.log('QRScanner: Livraison confirmée, redirection dans 3s');
          } else {
            // Échec paiement - afficher erreur et ne pas confirmer
            throw new Error(result.error || result.message || 'Erreur paiement vendeur');
          }
        } catch (err: unknown) {
          let errorMessage = 'Erreur paiement vendeur';
          if (err instanceof Error) {
            errorMessage = err.message;
          }
          console.error('[PAYOUT] Erreur:', errorMessage);
          toast({
            title: "❌ Échec du paiement vendeur",
            description: `La livraison est marquée comme terminée mais le paiement a échoué: ${errorMessage}`,
            variant: "destructive",
          });
        } finally {
          setIsPayoutInProgress(false);
          setIsConfirmingDelivery(false);
        }
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
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50">
      {/* Bandeau de progression paiement vendeur */}
      {isPayoutInProgress && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <div className="mx-auto max-w-md mt-2 px-4">
            <div className="rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Paiement vendeur en cours…</span>
              </div>
              <span className="text-white/80 text-sm">Vous pouvez continuer</span>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-sm">
        <div className="max-w-md mx-auto px-4">
          <div className="flex h-16 items-center justify-center gap-3">
            <img
              src={valideLogo}
              alt="Validèl"
              className="h-8 w-8 object-contain"
            />
            <h1 className="text-xl font-semibold tracking-tight text-white">Validèl</h1>
          </div>
        </div>
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
                <span className="font-semibold">Code commande:</span> <span className="bg-green-100 text-green-800 text-sm font-medium px-3 py-1 rounded">{currentOrder?.order_code}</span>
              </div>
            </DialogDescription>
          </DialogHeader>
          {currentOrder?.status === 'paid' && (
            <div className="mt-2">
              <p className="text-gray-600 mb-4 text-center">Cliquez sur le bouton ci-dessous pour commencer la livraison</p>
              <Button onClick={handleStartDelivery} className="w-full bg-green-600 hover:bg-green-700">
                Commencer à livrer
              </Button>
            </div>
          )}
          {currentOrder?.status === 'in_delivery' && currentOrder?.delivery_person_id === user?.id && (
            <div className="text-center mt-2">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-green-700 font-semibold text-lg">Livraison en cours</span>
              </div>
              <p className="text-gray-600 mb-4">Veuillez scanner le QR code du client pour valider la livraison</p>
              <Button className="bg-green-600 hover:bg-green-700 w-full" onClick={() => { setShowScanSection(true); setOrderModalOpen(false); }}>
                <Camera className="h-4 w-4 mr-2" /> Scanner le QR code maintenant
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex-1 w-full max-w-md mx-auto px-4 py-6">
        {deliveryConfirmed ? (
          <div className="w-full bg-white rounded-2xl shadow-lg p-6 flex flex-col items-center">
            <CheckCircle className="h-16 w-16 text-green-600 mb-4" />
            <h2 className="text-xl font-bold text-green-700 mb-2 text-center">Commande livrée et confirmée !</h2>
            <p className="text-green-800 text-base mb-2 text-center">La livraison a bien été validée. Les fonds seront transférés au vendeur sous 24h.</p>
            <Button className="mt-4 bg-green-600 hover:bg-green-700 text-white w-full" onClick={() => navigate('/delivery')}>Retour au dashboard</Button>
            <p className="text-sm text-gray-500 mt-2">Redirection automatique dans 3 secondes…</p>
          </div>
        ) : !showScanSection ? (
          <div className="space-y-4">
            {/* Recherche commande */}
            <Card className="border-0 shadow-lg">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <Package className="h-5 w-5 text-green-600" />
                  </div>
                  <span className="text-lg font-semibold text-gray-900">Rechercher une commande</span>
                </div>
                <div className="space-y-3">
                  <Input
                    type="text"
                    className="w-full h-12 rounded-xl px-4 text-base border-gray-200 focus:border-green-500 focus:ring-green-500"
                    placeholder="Ex: CAB1234"
                    value={orderCode}
                    onChange={e => setOrderCode(e.target.value)}
                  />
                  <div className="flex flex-col gap-3">
                    <Button 
                      className="w-full h-12 bg-green-600 hover:bg-green-700 text-white rounded-xl text-base font-semibold" 
                      onClick={handleSearchOrder}
                    >
                      Rechercher
                    </Button>

                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Instructions */}
            <Card className="border-0 shadow-lg">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <Info className="h-5 w-5 text-green-600" />
                  </div>
                  <span className="text-lg font-semibold text-gray-900">Instructions d'utilisation</span>
                </div>
                <ol className="space-y-3 text-gray-700 text-sm">
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                    <span><strong>Récupérez le code commande</strong> (format CAB1234) auprès du vendeur</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                    <span><strong>Tapez et recherchez</strong> ce code commande pour localiser la livraison</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                    <span><strong>Rendez-vous chez le client</strong> à l'adresse indiquée</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold">4</span>
                    <span><strong>Demandez le QR code sécurisé</strong> affiché dans l'app du client</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold">5</span>
                    <span><strong>Scannez le QR sécurisé</strong> pour valider et libérer les fonds au vendeur</span>
                  </li>
                </ol>
              </CardContent>
            </Card>
          </div>
        ) : (
          <QRScanSection
            scannedCode={scannedCode}
            setScannedCode={setScannedCode}
            handleScanQR={handleScanQR}
            validationResult={validationResult}
            handleConfirmDelivery={handleConfirmDelivery}
            resetScan={() => {}}
            isConfirmingDelivery={isConfirmingDelivery}
            matchInfo={lastMatchInfo}
          />
        )}
      </div>
    </div>
  );
};

export default QRScanner;
