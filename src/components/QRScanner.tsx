/* eslint-disable @typescript-eslint/no-unused-expressions */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QrCode, CheckCircle, AlertCircle, Camera, Package, Info, X, ZapOff, RotateCw } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
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

// Types locales pour commandes et résultats de validation
type Product = { name?: string | null; code?: string | null };
type Profile = { full_name?: string | null; phone?: string | null; wallet_type?: string | null; };
type Order = {
  id?: string;
  order_code?: string | null;
  qr_code?: string | null;
  qr_code_vendor?: string | null;
  assigned_at?: string | null;
  buyer_id?: string | null;
  buyer_phone?: string | null;
  created_at?: string;
  delivered_at?: string | null;
  delivery_address?: string | null;
  vendor_id?: string | null;
  delivery_person_id?: string | null;
  total_amount?: number | null;
  status?: string | null;
  products?: Product | null;
  buyer_profile?: Profile | null;
  vendor_profile?: Profile | null;
};
type ValidationResult = Order & { status: 'valid' | 'invalid' | string; timestamp: string; error?: string; code?: string };

// ---------------------------------------------------------------------------
// Html5QrcodeReact — scanner stabilisé
// ---------------------------------------------------------------------------
function Html5QrcodeReact({ onScan, onError, resetSignal, active = true }: {
  onScan: (s: string) => void;
  onError: (e: unknown) => void;
  resetSignal?: number;
  active?: boolean;
}) {
  const divId = 'qr-reader-react';
  const html5QrRef = useRef<Html5Qrcode | null>(null);
  const scanPausedRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  const startingRef = useRef(false);

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const isMobile = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);
  const qrboxSize = isMobile ? 220 : 250;

  useEffect(() => {
    if (!active) return;

    let destroyed = false;

    const stopAndClear = async (inst: Html5Qrcode) => {
      try {
        const state = (inst as unknown as { getState?: () => number }).getState?.();
        if (state === 2 || state === 3) {
          await inst.stop();
        }
      } catch { /* ignore */ }
      try { inst.clear(); } catch { /* ignore */ }
    };

    const start = async () => {
      if (startingRef.current) return;
      startingRef.current = true;

      // Stopper et détruire toute instance précédente
      if (html5QrRef.current) {
        await stopAndClear(html5QrRef.current);
        html5QrRef.current = null;
      }

      // Nettoyer le div
      const el = document.getElementById(divId);
      if (el) el.innerHTML = '';

      if (destroyed) { startingRef.current = false; return; }

      // Calculer la taille de la qrbox
      const sw = window.innerWidth;
      const sh = window.innerHeight;
      const size = Math.max(180, Math.min(Math.floor(Math.min(sw, sh) * 0.55), 280));

      try {
        const instance = new Html5Qrcode(divId);
        html5QrRef.current = instance;

        let cameras: { id: string; label: string }[] = [];
        try { cameras = await Html5Qrcode.getCameras(); } catch { /* ignore */ }

        if (destroyed) {
          await stopAndClear(instance);
          html5QrRef.current = null;
          startingRef.current = false;
          return;
        }

        const config = { fps: 10, qrbox: size, aspectRatio: 1.0 };

        const onDecode = (text: string) => {
          if (scanPausedRef.current) return;
          scanPausedRef.current = true;
          try { onScanRef.current(text); } catch { /* ignore */ }
          setTimeout(() => { scanPausedRef.current = false; }, 2500);
        };

        // Chercher explicitement la caméra arrière par son label
        const backCamera = cameras.find(c =>
          /back|rear|environment|arrière|arriere|posterior/i.test(c.label)
        );

        // Essayer d'abord avec facingMode exact, fallback si non supporté
        try {
          const cameraConfig: string | MediaTrackConstraints = backCamera?.id
            ? backCamera.id
            : ({ facingMode: { exact: 'environment' } } as MediaTrackConstraints);
          await instance.start(cameraConfig, config, onDecode, () => {});
        } catch {
          // Fallback sans 'exact' (certains navigateurs/iOS)
          await instance.start(
            { facingMode: 'environment' } as MediaTrackConstraints,
            config, onDecode, () => {}
          );
        }

      } catch (err) {
        if (destroyed) { startingRef.current = false; return; }

        const msg = String((err as { message?: string })?.message || err || '');
        const ignored = ['interrupted', 'AbortError', 'annulée', 'Cannot stop', 'not running'];
        if (ignored.some(s => msg.includes(s))) {
          startingRef.current = false;
          return;
        }

        let hint = "Impossible d'initialiser la caméra.";
        if (msg.includes('NotAllowedError') || msg.includes('Permission'))
          hint = "Permission caméra refusée. Autorisez la caméra puis rechargez.";
        else if (msg.includes('NotFoundError'))
          hint = "Aucune caméra détectée.";
        else if (msg.includes('NotReadableError'))
          hint = "Caméra utilisée par une autre application.";
        else if (typeof location !== 'undefined' && location.protocol !== 'https:' && location.hostname !== 'localhost')
          hint = "La caméra nécessite HTTPS.";

        onErrorRef.current(new Error(hint));
      } finally {
        startingRef.current = false;
      }
    };

    const timer = setTimeout(start, 150);

    return () => {
      destroyed = true;
      clearTimeout(timer);
      const inst = html5QrRef.current;
      html5QrRef.current = null;
      if (inst) stopAndClear(inst);
    };
  }, [resetSignal, active]);

  return (
    <>
      <style>{`
        #${divId} {
          position: fixed !important;
          inset: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          margin: 0 !important;
          padding: 0 !important;
          z-index: 1000;
          background: #000 !important;
          overflow: hidden !important;
        }
        #${divId} video {
          object-fit: cover !important;
          position: absolute !important;
          top: 0 !important; left: 0 !important;
          width: 100% !important; height: 100% !important;
          display: block !important; z-index: 1 !important;
        }
        #${divId} canvas,
        #${divId} img,
        #${divId} button,
        #${divId} select,
        #${divId} span { display: none !important; }
        #${divId} > div,
        #${divId} > div > div {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
        }
      `}</style>

      <div id={divId} style={{
        position: 'fixed', inset: 0,
        width: '100vw', height: '100vh',
        zIndex: 1000, background: '#000', overflow: 'hidden',
      }} />

      {/* Viseur centré */}
      <div style={{
        position: 'fixed',
        top: `calc(50% - ${qrboxSize / 2}px)`,
        left: `calc(50% - ${qrboxSize / 2}px)`,
        width: qrboxSize,
        height: qrboxSize,
        zIndex: 1100,
        pointerEvents: 'none',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: 36, height: 36, borderTop: '3px solid #fff', borderLeft: '3px solid #fff', borderRadius: '12px 0 0 0' }} />
        <div style={{ position: 'absolute', top: 0, right: 0, width: 36, height: 36, borderTop: '3px solid #fff', borderRight: '3px solid #fff', borderRadius: '0 12px 0 0' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: 36, height: 36, borderBottom: '3px solid #fff', borderLeft: '3px solid #fff', borderRadius: '0 0 0 12px' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 36, height: 36, borderBottom: '3px solid #fff', borderRight: '3px solid #fff', borderRadius: '0 0 12px 0' }} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// QRScanSection
// ---------------------------------------------------------------------------
function QRScanSection({
  scannedCode,
  setScannedCode,
  handleScanQR,
  validationResult,
  handleConfirmDelivery,
  resetScan,
  isConfirmingDelivery,
  matchInfo,
  scanSessionId,
  active,
  scanVendorQRMode,
  onClose,
}: {
  scannedCode: string;
  setScannedCode: (value: string) => void;
  handleScanQR: (code: string, reset?: () => void) => void;
  validationResult: ValidationResult | null;
  handleConfirmDelivery: () => void;
  resetScan?: () => void;
  isConfirmingDelivery: boolean;
  matchInfo: { type: 'order_code' | 'qr_code' | 'qr_code_vendor' | 'partial'; code: string } | null;
  scanSessionId: number;
  active: boolean;
  scanVendorQRMode: boolean;
  onClose: () => void;
}) {
  const [cameraError, setCameraError] = useState(false);
  const [cameraErrorMsg, setCameraErrorMsg] = useState('');
  const [hasScanned, setHasScanned] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [loadingScanner, setLoadingScanner] = useState(true);

  useEffect(() => {
    setHasScanned(false);
    setLoadingScanner(true);
    const timeout = setTimeout(() => setLoadingScanner(false), 1800);
    return () => clearTimeout(timeout);
  }, [scanSessionId]);

  const handleScan = (decodedText: string) => {
    setScannedCode(decodedText);
    handleScanQR(decodedText, () => setHasScanned(false));
    setHasScanned(true);
  };

  const handleError = (err: unknown) => {
    let name = '';
    if (typeof err === 'string') name = err;
    else if (err && typeof err === 'object' && 'name' in err && typeof (err as { name?: unknown }).name === 'string')
      name = (err as { name?: string }).name ?? '';

    let msg = "Erreur d'accès à la caméra. Vérifiez les permissions ou réessayez.";

    try {
      const rawMsg = typeof err === 'string'
        ? err
        : (err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string')
          ? (err as { message?: string }).message ?? ''
          : '';
      if (rawMsg && rawMsg.includes('initialisation du scanner a été annulée')) return;

      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        msg = "Permission caméra refusée. Autorisez la caméra via l'icône cadenas (Paramètres du site) puis rechargez la page.";
      } else if (name === 'NotFoundError') {
        msg = "Aucune caméra détectée. Vérifiez que votre appareil a une caméra et qu'elle est bien connectée.";
      } else if (name === 'NotReadableError') {
        msg = "La caméra est utilisée par une autre application. Fermez l'application et réessayez.";
      } else if (typeof location !== 'undefined' && location.protocol !== 'https:' && location.hostname !== 'localhost') {
        msg = "La caméra nécessite HTTPS. Servez la page en https:// ou utilisez localhost.";
      } else if (typeof err === 'string') {
        msg = err;
      } else if (err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
        msg = (err as { message?: string }).message ?? msg;
      }
    } catch { /* fallback */ }

    setCameraError(true);
    setCameraErrorMsg(msg);
  };

  const scanValid = validationResult && validationResult.status === 'valid';

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.35)', zIndex: 1000 }}>
      {/* Top controls */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 16px', pointerEvents: 'none' }}>
        <button
          type="button"
          aria-label="Fermer le scanner"
          onClick={onClose}
          style={{ width: 36, height: 36, borderRadius: 999, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', pointerEvents: 'auto' }}
        >
          <X className="h-5 w-5" />
        </button>
        <div style={{ display: 'flex', gap: 10, pointerEvents: 'auto' }}>
          <button type="button" aria-label="Flash" onClick={() => {}} style={{ width: 36, height: 36, borderRadius: 999, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <ZapOff className="h-5 w-5" />
          </button>
          <button type="button" aria-label="Changer de camera" onClick={() => {}} style={{ width: 36, height: 36, borderRadius: 999, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <RotateCw className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Loading overlay */}
      {loadingScanner && !cameraError && !scanValid && !hasScanned && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size="sm" />
        </div>
      )}

      {/* Scanner area */}
      <div
        className={`transition-opacity duration-300 ${(scanValid || hasScanned) ? 'opacity-0 pointer-events-none h-0 p-0 m-0' : 'opacity-100'}`}
        style={{ minHeight: (scanValid || hasScanned) ? 0 : 220 }}
      >
        {scanVendorQRMode && !scanValid && !hasScanned && (
          <div className="mb-4 text-left bg-white/60 p-3 rounded-md">
            <p className="text-xs font-medium text-gray-800">🛍️ Scanner le QR code de la commande</p>
            <p className="text-[11px] text-gray-600 mt-1">Demandez au vendeur de vous présenter le <strong>QR code de la commande</strong> pour la récupérer.</p>
          </div>
        )}

        {matchInfo && !scanVendorQRMode && !scanValid && !hasScanned && (
          <div className="mb-4 text-left bg-white/60 p-3 rounded-md">
            <p className="text-xs font-medium text-gray-800">✅ Commande {matchInfo.type === 'order_code' ? matchInfo.code : 'trouvée'}</p>
            <p className="text-[11px] text-gray-600 mt-1">Veuillez maintenant scanner le <strong>QR code sécurisé</strong> présenté par le client pour valider la livraison.</p>
          </div>
        )}

        {!cameraError && !scanValid && !hasScanned && (
          <Html5QrcodeReact
            key={scanSessionId}
            resetSignal={scanSessionId}
            onScan={handleScan}
            onError={handleError}
            active={active}
          />
        )}

        {cameraError && !scanValid && !hasScanned && (
          <div className="mt-4 flex flex-col items-center gap-3">
            <p className="text-red-600 mt-2 text-sm text-center">{cameraErrorMsg || "Impossible d'accéder à la caméra. Autorisez l'accès ou réessayez."}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="border-indigo-300 text-indigo-700 hover:bg-indigo-50" onClick={() => { setCameraError(false); setCameraErrorMsg(''); setHasScanned(false); resetScan && resetScan(); }}>
                Réessayer
              </Button>
              <Button variant="outline" className="text-indigo-700 underline" onClick={() => setShowGuide(s => !s)}>
                Guide
              </Button>
            </div>
            {showGuide && (
              <div className="mt-2 text-left bg-white/60 p-3 rounded-md text-sm text-gray-700 max-w-md">
                <p className="font-semibold">Comment autoriser la caméra</p>
                <ol className="list-decimal list-inside mt-2 space-y-1">
                  <li>Cliquez sur l'icône cadenas à gauche de la barre d'adresse</li>
                  <li>Ouvrez <strong>Paramètres du site</strong> → <strong>Caméra</strong> → sélectionnez <strong>Autoriser</strong></li>
                  <li>Rechargez la page</li>
                  <li>Si vous testez en local, utilisez <code>https://localhost</code> ou servez la page en HTTPS</li>
                </ol>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Validation success */}
      {validationResult && validationResult.status === 'valid' && (
        <div className={`transition-opacity duration-300 ${scanValid ? 'opacity-100' : 'opacity-0 pointer-events-none'} fixed inset-0 z-[1500] flex items-center justify-center px-6`}>
          <div className="flex flex-col items-center justify-center gap-5 w-full max-w-sm bg-white rounded-2xl p-8 shadow-2xl ring-1 ring-primary/20">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10">
                <CheckCircle className="h-8 w-8 text-primary" />
              </div>
              <span className="font-semibold text-lg text-gray-900">QR code valide et correspond à la commande</span>
            </div>
            <Button
              className="bg-primary text-primary-foreground w-full max-w-xs rounded-xl h-12 text-base font-semibold mt-2"
              disabled={isConfirmingDelivery}
              onClick={async () => { await handleConfirmDelivery(); }}
            >
              {isConfirmingDelivery ? (
                <span className="inline-flex items-center"><Spinner size="sm" className="mr-2 local-spinner" /> Confirmation…</span>
              ) : (
                'Confirmer la commande'
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Validation error */}
      {validationResult && validationResult.status === 'invalid' && (
        <div className="flex items-center gap-2 text-red-700 mt-6 bg-red-50 rounded-xl p-3 ring-1 ring-red-100">
          <AlertCircle className="h-6 w-6 text-red-600" />
          <span className="font-semibold">QR code invalide : {validationResult.error}</span>
        </div>
      )}

      {/* Instruction label */}
      <div style={{ position: 'fixed', left: 0, right: 0, top: '20px', textAlign: 'center', color: '#fff', fontSize: 14, lineHeight: 1.2, fontWeight: 500, zIndex: 1200, pointerEvents: 'none', padding: '0 16px' }}>
        {scanVendorQRMode
          ? "Scannez le QR code de la commande côté Vendeur(se)"
          : "Scannez le QR code du client pour confirmer la commande"
        }
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QRScanner (main component)
// ---------------------------------------------------------------------------
const QRScanner = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [scannedCode, setScannedCode] = useState<string>('');
  const [orderCode, setOrderCode] = useState<string>('');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [showScanSection, setShowScanSection] = useState(false);
  const [lastMatchInfo, setLastMatchInfo] = useState<{ type: 'order_code' | 'qr_code' | 'qr_code_vendor' | 'partial'; code: string } | null>(null);
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [isConfirmingDelivery, setIsConfirmingDelivery] = useState(false);
  const [validatedQrCode, setValidatedQrCode] = useState<string>('');
  const [scanSessionId, setScanSessionId] = useState(0);
  const [autoOpenScanner, setAutoOpenScanner] = useState(false);
  const [scanVendorQRMode, setScanVendorQRMode] = useState(false);
  const [vendorScanLocked, setVendorScanLocked] = useState(false);
  const [linkedVendorOrderCode, setLinkedVendorOrderCode] = useState<string>('');

  const openScannerSafely = () => {
    setOrderModalOpen(false);
    setTimeout(() => {
      setShowScanSection(true);
      setScanSessionId(s => s + 1);
    }, 160);
  };

  const mapPaydunyaError = (raw: unknown): string => {
    const msg = typeof raw === 'string' ? raw : JSON.stringify(raw || '');
    const lower = msg.toLowerCase();
    if (lower.includes('callback')) return 'URL de callback inaccessible. Vérifiez votre tunnel HTTPS (ex: ngrok) et la variable PAYDUNYA_CALLBACK_URL.';
    if (lower.includes('insufficient') || lower.includes('fond') || lower.includes('fund')) return 'Fonds insuffisants pour effectuer le paiement vendeur(se).';
    if (lower.includes('alias') || lower.includes('account') || lower.includes('numero') || lower.includes('numéro')) return 'Compte bénéficiaire (alias/numéro) invalide ou non supporté pour le mode de retrait.';
    return msg;
  };

  const handleStartDelivery = useCallback(async () => {
    if (!currentOrder) return;
    if (!user?.id) {
      toast({ title: 'Erreur', description: 'Utilisateur non connecté.', variant: 'destructive' });
      return;
    }
    try {
      if (!currentOrder.id) throw new Error('Order id manquant');

      try {
        const resp = await fetch(apiUrl('/api/orders/mark-in-delivery'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: currentOrder.id, deliveryPersonId: user.id }),
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok || !json?.success) throw new Error(json?.error || json?.message || 'Echec mark-in-delivery backend');
        const updated = (json?.order || { ...currentOrder, status: 'in_delivery', assigned_at: new Date().toISOString(), delivery_person_id: user.id }) as Order;
        setCurrentOrder(updated);
      } catch (backendErr) {
        console.warn('[QRScanner] backend mark-in-delivery failed, fallback supabase:', backendErr);
        const { error } = await supabase
          .from('orders')
          .update({ status: 'in_delivery', assigned_at: new Date().toISOString(), delivery_person_id: user.id })
          .eq('id', currentOrder.id as string);
        if (error) throw error;
        setCurrentOrder(prev => prev ? { ...prev, status: 'in_delivery', delivery_person_id: user.id } : prev);
      }

      await notifyBuyerDeliveryStarted(
        currentOrder.buyer_id as string,
        currentOrder.id as string,
        currentOrder.order_code || undefined,
      ).catch(err => console.warn('Notification démarrage livraison échouée:', err));

      toast({ title: 'Livraison démarrée', description: `Commande ${currentOrder.order_code} prise en charge.` });

      setOrderModalOpen(false);
      setShowScanSection(false);
      navigate(`/delivery?tab=in_progress&order_id=${encodeURIComponent(String(currentOrder.id || ''))}`);
    } catch (err) {
      console.error('handleStartDelivery error:', err);
      toast({ title: 'Erreur', description: 'Impossible de démarrer la livraison.', variant: 'destructive' });
    }
  }, [currentOrder, user?.id, toast, navigate]);

  // Precharge order from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('orderId');
    const orderCodeParam = params.get('orderCode');
    const autoStart = params.get('autoStart') || params.get('scan');

    if (autoStart) setAutoOpenScanner(true);
    if (!orderId && !orderCodeParam) return;

    let cancelled = false;
    (async () => {
      try {
        if (orderId) {
          const { data, error } = await supabase
            .from('orders')
            .select(`*, products(name, code), buyer_profile:profiles!orders_buyer_id_fkey(full_name, phone), vendor_profile:profiles!orders_vendor_id_fkey(full_name, phone, wallet_type)`)
            .eq('id', orderId)
            .maybeSingle();
          if (!cancelled && !error && data) {
            setCurrentOrder(data as Order);
            if (data.order_code) setOrderCode(String(data.order_code));
            return;
          }
        }
        if (orderCodeParam) {
          const cleaned = String(orderCodeParam).replace(/[^a-z0-9]/gi, '').toUpperCase();
          if (!cleaned) return;
          const { data, error } = await supabase
            .from('orders')
            .select(`*, products(name, code), buyer_profile:profiles!orders_buyer_id_fkey(full_name, phone), vendor_profile:profiles!orders_vendor_id_fkey(full_name, phone, wallet_type)`)
            .or(`order_code.ilike.%${cleaned}%,qr_code.ilike.%${cleaned}%`)
            .in('status', ['paid', 'assigned', 'in_delivery'])
            .maybeSingle();
          if (!cancelled && !error && data) {
            setCurrentOrder(data as Order);
            if (data.order_code) setOrderCode(String(data.order_code));
          }
        }
      } catch (e) {
        console.warn('[QRScanner] preload from URL failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSearchOrder = async () => {
    if (!orderCode.trim()) {
      toast({ title: "Erreur", description: "Veuillez entrer un code de commande", variant: "destructive" });
      return;
    }
    try {
      const cleaned = orderCode.trim().replace(/[^a-z0-9]/gi, '').toUpperCase();
      const pattern = `%${cleaned}%`;

      const { data, error } = await supabase
        .from('orders')
        .select(`*, products(name, code), buyer_profile:profiles!orders_buyer_id_fkey(full_name), vendor_profile:profiles!orders_vendor_id_fkey(phone, wallet_type)`)
        .or(`order_code.ilike.${pattern},qr_code.ilike.${pattern}`)
        .in('status', ['paid', 'in_delivery'])
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setCurrentOrder(data as Order);
        const normalize = (s: unknown) => (s || '').toString().replace(/[^a-z0-9]/gi, '').toUpperCase();
        const cleanedCode = orderCode.trim().replace(/[^a-z0-9]/gi, '').toUpperCase();
        const orderCodeNorm = normalize(data.order_code);
        const qrNorm = normalize(data.qr_code);
        let matchType: 'order_code' | 'qr_code' | 'partial' = 'partial';
        if (orderCodeNorm && orderCodeNorm === cleanedCode) matchType = 'order_code';
        else if (qrNorm && qrNorm === cleanedCode) matchType = 'qr_code';
        else if (orderCodeNorm && orderCodeNorm.includes(cleanedCode)) matchType = 'order_code';
        else if (qrNorm && qrNorm.includes(cleanedCode)) matchType = 'qr_code';
        const codeVal = matchType === 'qr_code' ? (data.qr_code ?? data.order_code ?? '') : (data.order_code ?? data.qr_code ?? '');
        setLastMatchInfo({ type: matchType, code: codeVal });
        setOrderModalOpen(true);
        toast({ title: "Commande trouvee", description: `Commande ${data.order_code} trouvee. Cliquez sur "Commencer a livrer" pour demarrer.` });
        return;
      }

      try {
        const resp = await fetch(apiUrl('/api/orders/search'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: cleaned }),
        });
        const json = await resp.json();
        if (json && json.success && json.order) {
          setCurrentOrder(json.order as Order);
          setLastMatchInfo({ type: 'order_code', code: json.order.order_code ?? '' });
          setOrderModalOpen(true);
          toast({ title: "Commande trouvee (backend)", description: `Commande ${json.order.order_code} trouvee via backend.` });
          return;
        }
        toast({ title: "Commande non trouvee", description: "Aucune commande trouvee avec ce code.", variant: "destructive" });
      } catch (e) {
        console.error('[Fallback backend] Erreur:', e);
        toast({ title: "Erreur reseau", description: "Impossible de contacter le backend.", variant: "destructive" });
      }
    } catch (error) {
      console.error('Erreur lors de la recherche de commande:', error);
      setCurrentOrder(null);
      toast({ title: "Erreur de recherche", description: "Une erreur s'est produite lors de la recherche de la commande", variant: "destructive" });
    } finally {
      setIsScanning(false);
    }
  };

  const handleScanVendorQR = () => {
    if (vendorScanLocked || currentOrder?.status === 'in_delivery') {
      toast({ title: 'Scan vendeur bloque', description: 'Le QR vendeur ne peut plus etre scanne pour cette commande en cours.', variant: 'destructive' });
      return;
    }
    setScanVendorQRMode(true);
    setShowScanSection(true);
    setScanSessionId(s => s + 1);
  };

  const handleScanQR = async (code: string, resetScanCb?: () => void) => {
    const codeToCheck = code !== undefined ? code : scannedCode;

    if (scanVendorQRMode) {
      setShowScanSection(false);
      try {
        const cleaned = codeToCheck.trim().replace(/[^a-z0-9]/gi, '').toUpperCase();
        let data: Order | null = null;
        let error: unknown = null;
        // Recherche par qr_code_vendor (le QR vendeur doit matcher ce champ)
        let result = await supabase
          .from('orders')
          .select(`*, products(name, code), buyer_profile:profiles!orders_buyer_id_fkey(full_name), vendor_profile:profiles!orders_vendor_id_fkey(phone, wallet_type)`)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .eq('qr_code_vendor' as any, cleaned)
          .in('status', ['paid', 'assigned'])
          .maybeSingle();
        data = result.data as Order | null;
        error = result.error;
        if (!data && !error) {
          result = await supabase
            .from('orders')
            .select(`*, products(name, code), buyer_profile:profiles!orders_buyer_id_fkey(full_name), vendor_profile:profiles!orders_vendor_id_fkey(phone, wallet_type)`)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .ilike('qr_code_vendor' as any, `%${cleaned}%`)
            .in('status', ['paid', 'assigned'])
            .limit(1)
            .maybeSingle();
          data = result.data as Order | null;
          error = result.error;
        }
        if (error || !data) {
          toast({ title: "Commande non trouvée", description: `Aucune commande ne correspond à ce QR code vendeur.`, variant: "destructive" });
          setShowScanSection(true);
          if (resetScanCb) resetScanCb();
          return;
        }
        setCurrentOrder(data as Order);
        setLastMatchInfo({ type: 'qr_code_vendor', code: data.qr_code_vendor ?? cleaned });
        setLinkedVendorOrderCode(data.qr_code_vendor ?? cleaned);
        setScanVendorQRMode(false);
        setVendorScanLocked(true);
        setShowScanSection(false);
        setOrderModalOpen(true);
        toast({ title: "Commande trouvée", description: `Commande ${data.order_code} trouvée via QR code vendeur.` });
        return;
      } catch (err) {
        console.error('Erreur scan QR vendeur:', err);
        toast({ title: "Erreur", description: "Erreur lors de la recherche de la commande (QR vendeur)", variant: "destructive" });
        setShowScanSection(true);
        if (resetScanCb) resetScanCb();
        return;
      }
    }

    if (!codeToCheck.trim()) {
      toast({ title: "Erreur", description: "Veuillez entrer ou scanner un code QR", variant: "destructive" });
      return;
    }

    try {
      const normalize = (s: unknown) => (s || '').toString().replace(/[^a-z0-9]/gi, '').toUpperCase();
      const scannedNormalized = normalize(codeToCheck);
      const expectedNormalized = normalize(currentOrder?.qr_code);
      const orderCodeNormalized = normalize(currentOrder?.order_code);
      const vendorQrNormalized = normalize(currentOrder?.qr_code_vendor);
      // Pour la validation client, seul qr_code doit matcher (pas le code vendeur)
      if (!expectedNormalized) throw new Error('QR client manquant pour cette commande');
      if (scannedNormalized !== expectedNormalized) throw new Error('QR code client non valide pour cette commande');
      if (vendorQrNormalized && scannedNormalized === vendorQrNormalized) throw new Error('Ce QR code est réservé au vendeur/livreur. Demandez le QR code client.');
      if (currentOrder?.delivery_person_id !== user?.id) throw new Error('Vous n’êtes pas le livreur assigné à cette commande');
      setValidationResult({ ...(currentOrder as Order), status: 'valid', timestamp: new Date().toLocaleString() });
      setValidatedQrCode(codeToCheck);
      toast({ title: "QR Code valide", description: `Livraison confirmée pour ${currentOrder?.buyer_profile?.full_name}` });
    } catch (error) {
      const errorMessage = toFrenchErrorMessage(error, 'Erreur inconnue');
      setValidationResult({ status: 'invalid', code: codeToCheck, timestamp: new Date().toLocaleString(), error: errorMessage });
      setValidatedQrCode('');
      toast({ title: "QR Code invalide", description: errorMessage || "Ce code QR n’est pas valide", variant: "destructive" });
      if (resetScanCb) resetScanCb();
    }
  };

  const handleConfirmDelivery = async () => {
    if (validationResult && validationResult.status === 'valid') {
      try {
        if (!validatedQrCode) throw new Error('QR client validé manquant. Veuillez rescanner le QR code client.');

        const normalize = (s: unknown) => (s || '').toString().replace(/[^a-z0-9]/gi, '').toUpperCase();
        const validatedNormalized = normalize(validatedQrCode);
        const orderCodeNormalized = normalize(currentOrder?.order_code || validationResult?.order_code);
        const linkedVendorNormalized = normalize(linkedVendorOrderCode);
        const expectedQrNormalized = normalize(currentOrder?.qr_code || validationResult?.qr_code);
        const isLegacySameQr = !!expectedQrNormalized && !!orderCodeNormalized && expectedQrNormalized === orderCodeNormalized;

        if (
          !isLegacySameQr &&
          ((validatedNormalized && orderCodeNormalized && validatedNormalized === orderCodeNormalized) ||
            (validatedNormalized && linkedVendorNormalized && validatedNormalized === linkedVendorNormalized))
        ) {
          throw new Error('Tentative bloquée: le QR vendeur ne peut pas confirmer la livraison.');
        }

        setIsConfirmingDelivery(true);

        let updatedOrder: Order | null = null;
        try {
          const resp = await fetch(apiUrl('/api/orders/mark-delivered'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: validationResult.id, deliveredBy: user?.id, scannedQrCode: validatedQrCode }),
          });
          const json = await resp.json().catch(() => ({}));
          if (!resp.ok || !json || !json.success) throw new Error(json?.error || json?.message || 'Échec confirmation livraison côté serveur');
          updatedOrder = json.order || json.updated || { id: validationResult.id, status: 'delivered' };
        } catch (e) {
          console.warn('QRScanner: mark-delivered backend échoué, fallback client activé', e);
          const { data: fallbackUpdated, error: fallbackError } = await supabase
            .from('orders')
            .update({ status: 'delivered', delivered_at: new Date().toISOString() })
            .eq('id', validationResult.id as string)
            .select('*')
            .single();
          if (fallbackError) throw fallbackError;
          updatedOrder = (fallbackUpdated as Order) || { id: validationResult.id, status: 'delivered' };
        }

        console.log('QRScanner: ✅ Commande livrée:', updatedOrder?.status || 'delivered');

        notifyDeliveryCompleted(
          validationResult.vendor_id as string,
          validationResult.buyer_id as string,
          validationResult.id as string,
          validationResult.order_code || undefined,
        ).catch(err => console.warn('Notification livraison terminée échouée:', err));

        toast({
          title: "✅ Livraison validée",
          description: "La commande a été marquée comme livrée. Le paiement au vendeur est en attente de validation par un administrateur.",
        });

        (async () => {
          try {
            await fetch(apiUrl('/api/notify/admin-delivery-request'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId: validationResult.id }),
            });
          } catch (e) {
            console.warn('Erreur notification admin:', e);
          }
        })();

        setValidationResult(null);
        setValidatedQrCode('');
        setScannedCode('');
        setOrderCode('');
        setVendorScanLocked(false);
        setLinkedVendorOrderCode('');
        setCurrentOrder(null);
        openScannerSafely();
        setIsConfirmingDelivery(false);
        try { navigate('/delivery'); } catch { /* ignore */ }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
        console.error('QRScanner: erreur update delivered', errorMessage);
        toast({ title: "Erreur", description: "Impossible de confirmer la livraison : " + errorMessage, variant: "destructive" });
        setIsConfirmingDelivery(false);
      }
    }
  };

  useEffect(() => {
    if (showScanSection && currentOrder) {
      setIsScanning(true);
      setTimeout(() => {
        setScannedCode(currentOrder.qr_code || '');
        setIsScanning(false);
        toast({ title: "QR Code scanné", description: "Code QR détecté automatiquement" });
      }, 2000);
    }
    // eslint-disable-next-line
  }, [showScanSection]);

  useEffect(() => {
    if (!currentOrder) return;
    if (currentOrder.status === 'in_delivery' && String(currentOrder.delivery_person_id) === String(user?.id)) {
      setOrderModalOpen(true);
      return;
    }
    setOrderModalOpen(true);
  }, [currentOrder, user?.id]);

  useEffect(() => {
    if (!autoOpenScanner || !currentOrder || !user?.id) return;
    (async () => {
      try {
        if (currentOrder.status === 'in_delivery') {
          if (String(currentOrder.delivery_person_id) === String(user.id)) {
            try { openScannerSafely(); }
            catch (e) { console.warn('[QRScanner] auto open scanner failed, falling back to modal', e); setOrderModalOpen(true); }
          } else {
            toast({ title: 'Commande non disponible', description: 'Cette commande est déjà prise en charge par un autre livreur.', variant: 'destructive' });
          }
        } else if (currentOrder.status === 'paid') {
          try { await handleStartDelivery(); setOrderModalOpen(true); }
          catch (startErr) { console.warn('Auto-start delivery failed:', startErr); setOrderModalOpen(true); }
        } else if (currentOrder.status === 'delivered') {
          toast({ title: 'Commande déjà livrée', description: 'Cette commande est déjà marquée comme livrée.', variant: 'default' });
          setOrderModalOpen(false);
          setShowScanSection(false);
        } else {
          toast({ title: 'Commande non prête', description: "Impossible d'ouvrir le scanner pour cette commande.", variant: 'destructive' });
        }
      } finally {
        setAutoOpenScanner(false);
      }
    })();
  }, [autoOpenScanner, currentOrder, handleStartDelivery, toast, user?.id]);

  return (
    <div className="min-h-screen bg-primary/10">
      {/* Header */}
      <div className="w-full bg-primary shadow-sm">
        <div className="max-w-md mx-auto px-4">
          <div className="flex h-16 items-center justify-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-primary-foreground">Validèl</h1>
          </div>
        </div>
      </div>

      {/* Order detail modal */}
      <Dialog open={orderModalOpen && !!currentOrder && !showScanSection && !deliveryConfirmed} onOpenChange={setOrderModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{currentOrder?.products?.name}</DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-col gap-1 mt-2">
                <span className="font-semibold">Client:</span> {currentOrder?.buyer_profile?.full_name}<br />
                <span className="font-semibold">Adresse:</span> {currentOrder?.delivery_address}<br />
                <span className="font-semibold">Téléphone:</span> {currentOrder?.buyer_phone}<br />
                <span className="font-semibold">Code commande:</span> <span className="bg-primary/10 text-primary text-sm font-medium px-3 py-1 rounded">{currentOrder?.order_code}</span>
              </div>
            </DialogDescription>
          </DialogHeader>
          {currentOrder?.status === 'paid' && (
            <div className="mt-2">
              <p className="text-gray-600 mb-4 text-center">Cliquez sur le bouton ci-dessous pour commencer la livraison</p>
              <Button onClick={handleStartDelivery} className="w-full bg-primary text-primary-foreground rounded-xl">
                Commencer à livrer
              </Button>
            </div>
          )}
          {currentOrder?.status === 'in_delivery' && currentOrder?.delivery_person_id === user?.id && (
            <div className="text-center mt-2">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                <span className="text-primary font-semibold text-lg">Livraison en cours</span>
              </div>
              <p className="text-gray-600 mb-4">Cliquez sur le bouton pour scanner le QR code du client</p>
              <Button className="bg-primary text-primary-foreground w-full rounded-xl" onClick={() => { openScannerSafely(); }}>
                Scanner Qrcode Client
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex-1 w-full max-w-md mx-auto px-4 py-6">
        {deliveryConfirmed ? (
          <div className="w-full bg-white rounded-2xl shadow-lg p-6 flex flex-col items-center">
            <CheckCircle className="h-16 w-16 text-primary mb-4" />
            <h2 className="text-xl font-bold text-primary mb-2 text-center">Commande livrée et confirmée !</h2>
            <p className="text-primary text-base mb-2 text-center">La livraison a bien été validée. Le paiement au vendeur est en attente de validation par un administrateur.</p>
            <Button className="mt-4 bg-primary text-primary-foreground w-full rounded-xl" onClick={() => navigate('/delivery')}>Retour au dashboard</Button>
            <p className="text-sm text-gray-500 mt-2">Redirection automatique dans 3 secondes…</p>
          </div>
        ) : !showScanSection ? (
          <div className="space-y-4">
            <Card className="border-0 shadow-lg">
              <CardContent className="p-5 flex items-center justify-center min-h-[120px]">
                <Button
                  className="w-full h-14 bg-primary text-primary-foreground rounded-xl text-lg font-semibold flex items-center justify-center gap-2 hover:bg-primary/90"
                  onClick={handleScanVendorQR}
                >
                  Scanner QR Commande
                </Button>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-5 flex flex-col items-center justify-center min-h-[160px] gap-4">
                <p className="text-sm text-gray-500 mb-0 text-center">Ou entrez le code commande manuellement :</p>
                <div className="w-full max-w-full">
                  <Input
                    type="text"
                    className="w-full h-12 rounded-xl px-4 text-base border-gray-200 focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
                    placeholder="Ex: CAB1234"
                    value={orderCode}
                    onChange={e => setOrderCode(e.target.value)}
                  />
                  <div className="mt-3">
                    <Button
                      className="w-full h-12 bg-primary text-primary-foreground text-base font-semibold rounded-xl"
                      onClick={handleSearchOrder}
                    >
                      Rechercher
                    </Button>
                  </div>
                </div>
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
            resetScan={() => setScanSessionId(s => s + 1)}
            isConfirmingDelivery={isConfirmingDelivery}
            matchInfo={lastMatchInfo}
            scanSessionId={scanSessionId}
            active={showScanSection}
            scanVendorQRMode={scanVendorQRMode}
            onClose={() => { setShowScanSection(false); }}
          />
        )}
      </div>
    </div>
  );
};

export default QRScanner;
