/* eslint-disable @typescript-eslint/no-unused-expressions */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QrCode, CheckCircle, AlertCircle, Camera, Package, Info, Loader2 } from 'lucide-react';
const valideLogo = '/icons/validel-logo.svg';
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
type ValidationResult = Order & { status: 'valid'|'invalid'|string; timestamp: string; error?: string; code?: string };


function Html5QrcodeReact({ onScan, onError, resetSignal, active = true }: { onScan: (s: string) => void; onError: (e: unknown) => void; resetSignal?: number; active?: boolean }) {
  const divId = 'qr-reader-react';
  const html5Qr = useRef<Html5Qrcode | null>(null);
  const [scanPaused, setScanPaused] = useState(false);
  const scanPausedRef = useRef<boolean>(scanPaused);
  useEffect(() => { scanPausedRef.current = scanPaused; }, [scanPaused]);
  // Détection mobile
  const isMobile = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);
  const isMobileRef = useRef<boolean>(isMobile);

  // Measure the container and compute a proportional qrbox size so the
  // scanning box stays inside the visible frame and scales with layout.
  const containerRef = useRef<HTMLDivElement | null>(null);
  // computed size used for the visual overlay. Start with a reasonable
  // default but compute a stable size based on the container (92% of
  // the smaller dimension so the visual frame fills the rounded square).
  const [computedQrbox, setComputedQrbox] = useState<number>(isMobile ? 220 : 420);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let debounce: number | null = null;
    const update = () => {
      const w = el.clientWidth || (isMobileRef.current ? 360 : 600);
      const h = el.clientHeight || w;
      // Use 92% of the smaller dimension so the scan-frame (CSS uses 92%)
      const raw = Math.floor(Math.min(w, h) * 0.92);
      const size = Math.max(120, Math.min(raw, Math.floor(Math.max(w, h))));
      // Only update when change is meaningful to avoid tiny oscillations
      setComputedQrbox(prev => (Math.abs(prev - size) > 8 ? size : prev));
    };
    const handler = () => {
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(update, 120);
    };
    update();
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(handler);
      ro.observe(el);
      window.addEventListener('resize', handler);
      // Also listen to orientation changes which are common on Android devices
      window.addEventListener('orientationchange', handler);
      // Some Android browsers report sizes late; schedule a few extra updates
      // shortly after mount to converge to the final size.
      try { window.setTimeout(update, 200); } catch (e) { /* ignore */ }
      try { window.setTimeout(update, 600); } catch (e) { /* ignore */ }
      try { window.setTimeout(update, 1200); } catch (e) { /* ignore */ }
    } catch (e) {
      // ResizeObserver may not be available in some environments; ignore
    }
    return () => {
      if (debounce) window.clearTimeout(debounce);
      if (ro) ro.disconnect();
      try { window.removeEventListener('resize', handler); } catch (e) { /* ignore */ }
      try { window.removeEventListener('orientationchange', handler); } catch (e) { /* ignore */ }
    };
  }, [isMobile]);
  // Initialize and start the scanner once. We compute the qrbox from the
  // container at start so the scanner matches the visual frame, but we do
  // NOT re-run the entire start sequence on every tiny resize to avoid
  // flicker and instability. The visual overlay (`computedQrbox`) still
  // updates for the UI, but the scanner remains stable until unmount.
  // Start/stop scanner on mount and when resetSignal changes. This prevents
  // continuous remounts from the parent and allows controlled resets.
  useEffect(() => {
    let isMounted = true;
    const isStarting = { current: false } as { current: boolean };

    // Suppress specific unhandled promise rejections coming from media play interruptions
    const _qrUnhandledRejection = (ev: PromiseRejectionEvent) => {
      try {
        const reason = (ev && (ev as PromiseRejectionEvent).reason) ?? ev;
        let msg = '';
        try {
          if (typeof reason === 'object' && reason !== null && 'message' in reason && typeof (reason as { message?: unknown }).message === 'string') {
            msg = String((reason as { message?: unknown }).message);
          } else {
            msg = String(reason);
          }
        } catch (e) {
          msg = String(reason);
        }
        if (msg && (msg.includes('play() request was interrupted') || (typeof reason === 'object' && reason !== null && 'name' in reason && String((reason as { name?: unknown }).name) === 'AbortError'))) {
          ev.preventDefault();
          console.debug('[QR] suppressed unhandled rejection:', msg);
        }
      } catch (err) { /* ignore */ }
    };
    window.addEventListener('unhandledrejection', _qrUnhandledRejection);

    const doStart = async () => {
      if (!active || isStarting.current) return;
      isStarting.current = true;
      try {
        // stop/clear any existing instance
        if (html5Qr.current) {
          const inst = html5Qr.current;
          try { await inst.stop(); } catch (e) { /* ignore */ }
          try { inst.clear(); } catch (e) { /* ignore */ }
          html5Qr.current = null;
        }

        html5Qr.current = new Html5Qrcode(divId);
          let cameras = [] as { id: string; label?: string }[];
          try {
            cameras = await Html5Qrcode.getCameras();
          } catch (e) {
            console.debug('[QR] getCameras failed:', e);
          }
          console.debug('[QR] cameras detected:', cameras);
        if (!isMounted || !active) return;
        const cameraId = cameras && cameras[0] && cameras[0].id;
        if (!cameraId) {
          console.debug('[QR] no cameraId found, will try facingMode fallback');
        }

        const el = containerRef.current;
        const w = el ? (el.clientWidth || (isMobileRef.current ? 360 : 600)) : (isMobileRef.current ? 360 : 600);
        const h = el ? (el.clientHeight || w) : w;
        const startQrbox = Math.max(120, Math.floor(Math.min(w, h) * 0.92));
        setComputedQrbox(prev => (Math.abs(prev - startQrbox) > 8 ? startQrbox : prev));

        try {
          if (!isMounted || !active || !html5Qr.current) {
            // If scanner is no longer active, this is an expected cleanup path
            // and should not surface as a user-facing error.
            return;
          }

          type StartConfigLocal = {
            fps: number;
            qrbox: number;
            videoConstraints?: MediaTrackConstraints | { facingMode?: string; width?: { ideal: number } };
          };
          const inst = html5Qr.current;
          const startConfig: StartConfigLocal = {
            fps: 15,
            qrbox: startQrbox,
            videoConstraints: { facingMode: 'environment', width: { ideal: isMobileRef.current ? 360 : 640 } }
          };

          // Try with enumerated cameraId first; fall back to facingMode object
          try {
            if (cameraId) {
              await inst.start(
                cameraId,
                startConfig,
                (decodedText) => {
                  if (scanPausedRef.current) return;
                  setScanPaused(true);
                  onScan(decodedText);
                  setTimeout(() => setScanPaused(false), 2000);
                },
                (err) => { console.debug('[QR] scan error:', err); }
              );
            } else {
              // Some Android browsers don't return camera IDs reliably; use facingMode fallback
              const fallbackCamera: MediaTrackConstraints = { facingMode: 'environment' };
              await inst.start(
                fallbackCamera,
                startConfig,
                (decodedText) => {
                  if (scanPausedRef.current) return;
                  setScanPaused(true);
                  onScan(decodedText);
                  setTimeout(() => setScanPaused(false), 2000);
                },
                (err) => { console.debug('[QR] scan error (facingMode):', err); }
              );
            }
          } catch (errStart) {
            console.error('[QR] start() failed', errStart);
            // Provide a more helpful error to the UI (permissions/HTTPS hints)
            let hint = '';
            try {
              const msg = String(errStart || '');
              if (msg.includes('NotAllowedError') || msg.includes('PermissionDeniedError')) hint = "Permission caméra refusée";
              else if (msg.includes('NotFoundError')) hint = 'Aucune caméra détectée';
              else if (msg.includes('NotReadableError')) hint = 'La caméra est utilisée par une autre application';
            } catch (e) { /* ignore */ }
            const userMessage = hint || 'Impossible d\'initialiser la caméra. Vérifiez les permissions et servez la page en HTTPS.';
            onError(new Error(userMessage + ' — ' + (errStart instanceof Error ? errStart.message : String(errStart))));
          }
          // Mobile devices (particularly Android) may report layout changes
          // after the camera stream starts. If the container size changes
          // significantly right after start, attempt a safe one-time restart
          // to realign the scanner's qrbox to the visual frame.
          if (isMobileRef.current) {
            (async () => {
              try {
                const restartAttempted = { val: false } as { val: boolean };
                await new Promise(r => setTimeout(r, 500));
                if (!isMounted || !active || !html5Qr.current) return;
                const el2 = containerRef.current;
                if (!el2) return;
                const w2 = el2.clientWidth || (isMobileRef.current ? 360 : 600);
                const h2 = el2.clientHeight || w2;
                const recalculated = Math.max(120, Math.floor(Math.min(w2, h2) * 0.92));
                if (Math.abs(recalculated - startQrbox) > 8 && !restartAttempted.val) {
                  restartAttempted.val = true;
                  try {
                    const inst2 = html5Qr.current;
                    if (inst2) {
                      try { await inst2.stop(); } catch (e) { /* ignore */ }
                      try { inst2.clear(); } catch (e) { /* ignore */ }
                    }
                    if (!isMounted || !active) return;
                    html5Qr.current = new Html5Qrcode(divId);
                    const inst3 = html5Qr.current;
                    if (!inst3) return;
                    await inst3.start(
                      cameraId,
                      { fps: 15, qrbox: recalculated, videoConstraints: { facingMode: 'environment', width: { ideal: isMobileRef.current ? 360 : 640 } } },
                      (decodedText) => {
                        if (scanPausedRef.current) return;
                        setScanPaused(true);
                        onScan(decodedText);
                        setTimeout(() => setScanPaused(false), 2000);
                      },
                      (err) => console.debug('[QR] scan error:', err)
                    );
                  } catch (e) {
                    // ignore restart failures; continue with existing instance
                    console.warn('[QR] mobile restart attempt failed', e);
                  }
                }
              } catch (e) {
                /* ignore */
              }
            })();
          }
        } catch (startErr) {
          const msg = String(startErr || '');
          if ((msg.includes('Cannot clear while scan is ongoing') || msg.includes('clear while scan')) && isMounted && active) {
            try {
              const inst = html5Qr.current;
              if (inst) {
                try { await inst.stop(); } catch (e) { /* ignore */ }
                try { inst.clear(); } catch (e) { /* ignore */ }
              }
              if (!isMounted || !active) { return; }
              html5Qr.current = new Html5Qrcode(divId);
              const inst2 = html5Qr.current;
              if (!inst2) { onError(new Error('Impossible de créer une instance du scanner')); return; }
              await inst2.start(
                cameraId,
                { fps: 15, qrbox: startQrbox, videoConstraints: { facingMode: 'environment', width: { ideal: isMobileRef.current ? 360 : 640 } } },
                (decodedText) => {
                  if (scanPausedRef.current) return;
                  setScanPaused(true);
                  onScan(decodedText);
                  setTimeout(() => setScanPaused(false), 2000);
                },
                (err) => console.debug('[QR] scan error:', err)
              );
              return;
            } catch (e) {
              // fall through
            }
          }
          const friendly = startErr instanceof Error ? startErr : new Error(String(startErr));
          onError(friendly);
        }
      } finally {
        isStarting.current = false;
      }
    };

    const doStop = async () => {
      const inst = html5Qr.current;
      if (!inst) return;
      try { await inst.stop(); } catch (e) { /* ignore */ }
      try { inst.clear(); } catch (e) { /* ignore */ }
      try { html5Qr.current = null; } catch (e) { /* ignore */ }
    };

    if (active) {
      doStart();
    }

    return () => {
      window.removeEventListener('unhandledrejection', _qrUnhandledRejection);
      isMounted = false;
      doStop();
    };
  }, [onScan, onError, resetSignal, active]);
  return (
    <>
      <style>{`
        /* Container with rounded corners and subtle shadow */
        #${divId} {
          display:flex;
          justify-content:center;
          align-items:center;
          position:relative;
          width:100%;
          max-width:600px;
          margin:12px auto;
          aspect-ratio: 1 / 1;
          border-radius:28px;
          overflow:hidden;
          background:#000;
          box-shadow:0 20px 48px rgba(16,24,40,0.10);
        }

        /* Video fills the container and inherits the rounded look via overflow:hidden */
        #${divId} video {
          object-fit: cover !important;
          object-position: center center !important;
          width: 100% !important;
          height: 100% !important;
          display:block;
          background-color:#000;
          -webkit-border-radius: inherit;
          border-radius: inherit;
        }

        /* Ensure any canvas or html5-qrcode injected elements inherit rounded corners */
        #${divId} canvas,
        #${divId} [class*="html5-qrcode"],
        #${divId} .qrbox,
        #${divId} .html5-qrcode-video {
          -webkit-border-radius: inherit !important;
          border-radius: inherit !important;
          overflow: hidden !important;
        }

        /* Remove default library borders/boxes so our rounded scan-frame is the visual focus */
        #${divId} .qrbox,
        #${divId} .html5-qrcode-region {
          box-shadow: none !important;
          border: none !important;
        }

        /* Overlay centered scan frame */
        #${divId} .qr-overlay{
          position:absolute;
          inset:0;
          display:flex;
          align-items:center;
          justify-content:center;
          pointer-events:none;
        }
        #${divId} .scan-frame{
          /* Make the visual frame large and mostly transparent so the camera
             feed is visible inside the frame. Keep it proportional to the
             container so the clickable area is obvious to the user. */
          width:92%;
          aspect-ratio:1;
          border-radius:28px;
          box-shadow: inset 0 0 0 2px rgba(255,255,255,0.06);
          position:relative;
          display:block;
          margin:auto;
          background: transparent;
        }

        /* Optional: subtle inner border for the scanning area */
        #${divId} .scan-frame::after{
          content:'';
          position:absolute;
          inset:0;
          border-radius:20px;
          box-shadow: 0 0 0 2px rgba(255,255,255,0.06) inset;
        }
      `}</style>
      <div
        id={divId}
        ref={containerRef}
        style={{ width: '100%', maxWidth: isMobile ? '100%' : 600, aspectRatio: '1', margin: '12px auto' }}
      >
        {/* Use the computedQrbox to size the visual scan-frame so the visible overlay matches the scanner's configured qrbox */}
        <div className="qr-overlay"><div className="scan-frame" style={{ width: computedQrbox, height: computedQrbox, borderRadius: 28 }} /></div>
      </div>
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
  matchInfo,
  scanSessionId,
  active,
  scanVendorQRMode
}) {
  // matchInfo: { type: 'order_code'|'qr_code'|'partial', code: string } | null
  const [cameraError, setCameraError] = useState(false);
  const [cameraErrorMsg, setCameraErrorMsg] = useState('');
  const [hasScanned, setHasScanned] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // When scanSessionId increments, reset internal scanner state so scanning resumes
  useEffect(() => {
    setHasScanned(false);
  }, [scanSessionId]);

  const handleScan = (decodedText: string) => {
    console.log('handleScan appelé, decodedText =', decodedText);
    setScannedCode(decodedText);
    handleScanQR(decodedText, () => setHasScanned(false));
    setHasScanned(true); // Masquer le scanner dès qu'un code est détecté
  }; 
  const handleError = (err: unknown) => {
    // Try to produce a helpful, localized message based on the error type
    let name = '';
    if (typeof err === 'string') name = err;
    else if (err && typeof err === 'object' && 'name' in err && typeof (err as { name?: unknown }).name === 'string') name = (err as { name?: string }).name ?? '';

    let msg = 'Erreur d\'accès à la caméra. Vérifiez les permissions ou réessayez.';

    try {
      const rawMsg = typeof err === 'string'
        ? err
        : (err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string')
          ? (err as { message?: string }).message ?? ''
          : '';
      if (rawMsg && rawMsg.includes('initialisation du scanner a été annulée')) {
        return;
      }
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
    } catch (e) {
      // fallback to generic message
    }

    setCameraError(true);
    setCameraErrorMsg(msg);
  }; 

  // Détermine si le scan est validé
  const scanValid = validationResult && validationResult.status === 'valid';

  return (
    <Card className="mb-8 rounded-3xl border-0 bg-white/80 backdrop-blur shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center text-xl">
          <QrCode className="h-5 w-5 mr-2 text-primary" />
          <span className="text-primary">
            {scanVendorQRMode ? 'Scanner QR Commande' : 'Scanner de validation'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Scanner et champ manuel masqués si scan validé OU si un code a été scanné */}
          <div
            className={`rounded-2xl p-6 sm:p-8 text-center transition-opacity duration-300 ${(scanValid || hasScanned) ? 'opacity-0 pointer-events-none h-0 p-0 m-0' : 'opacity-100'} bg-gradient-to-br from-indigo-50 to-sky-50 ring-1 ring-indigo-100`}
            style={{ minHeight: (scanValid || hasScanned) ? 0 : 220 }}
          >
            {/* Message différent selon le mode */}
            {scanVendorQRMode && !scanValid && !hasScanned && (
              <div className="mb-4 text-left bg-white/60 p-3 rounded-md">
                <p className="text-sm font-medium text-gray-800">🛍️ Scanner le QR code de la commande</p>
                <p className="text-xs text-gray-600 mt-1">Demandez au vendeur de vous présenter le <strong>QR code de la commande</strong> pour la récupérer.</p>
              </div>
            )}

            {/* Si on a déjà trouvé une correspondance via recherche manuelle, afficher une instruction */}
            {matchInfo && !scanVendorQRMode && !scanValid && !hasScanned && (
              <div className="mb-4 text-left bg-white/60 p-3 rounded-md">
                <p className="text-sm font-medium text-gray-800">✅ Commande {matchInfo.type === 'order_code' ? matchInfo.code : 'trouvée'}</p>
                <p className="text-xs text-gray-600 mt-1">Veuillez maintenant scanner le <strong>QR code sécurisé</strong> présenté par le client pour valider la livraison.</p>
                {/* "Scanner maintenant" button removed to avoid confusing duplicate actions */}
              </div>
            )}
            {!cameraError && !scanValid && !hasScanned ? (
              <Html5QrcodeReact resetSignal={scanSessionId} onScan={handleScan} onError={handleError} active={active} />
            ) : null}
            {!scanValid && !hasScanned && (
              <>
                <p className="text-gray-700 mt-4">
                  {scanVendorQRMode ? 'Scannez le QR code de la commande' : 'Scannez le QR code du client avec la caméra'}
                </p>
                <p className="text-xs text-gray-500 mt-1">Astuce : placez le QR code bien au centre du cadre et assurez-vous d'une bonne lumière pour accélérer la détection.</p>
              </>
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
          {/* Bloc de validation avec effet fondu */}
          <div className={`transition-opacity duration-300 ${scanValid ? 'opacity-100' : 'opacity-0 pointer-events-none h-0 p-0 m-0'} flex items-center justify-center min-h-[220px]`}
            style={{ minHeight: scanValid ? 220 : 0 }}>
            {validationResult && validationResult.status === 'valid' && (
              <div className="flex flex-col items-center justify-center gap-5 w-full bg-primary/10 rounded-2xl p-6 ring-1 ring-primary/20">
                <div className="flex items-center gap-2 text-primary text-center">
                  <CheckCircle className="h-6 w-6 text-primary" />
                  <span className="font-semibold text-lg">QR code valide et correspond à la commande</span>
                </div>
                <Button
                  className="bg-primary text-primary-foreground mt-2 w-full max-w-xs rounded-xl"
                  disabled={isConfirmingDelivery}
                  onClick={async () => {
                    await handleConfirmDelivery();
                  }}
                >
                  {isConfirmingDelivery ? (
                    <span className="inline-flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin local-spinner" /> Confirmation…</span>
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
  const [scannedCode, setScannedCode] = useState<string>('');
  const [orderCode, setOrderCode] = useState<string>('');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [showScanSection, setShowScanSection] = useState(false);
  const [lastMatchInfo, setLastMatchInfo] = useState<{ type: 'order_code'|'qr_code'|'partial', code: string } | null>(null);
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [isConfirmingDelivery, setIsConfirmingDelivery] = useState(false);
  // session id incrementation to reset scanner state after a delivery is confirmed
  const [scanSessionId, setScanSessionId] = useState(0);
  // When navigating from DeliveryDashboard with ?autoStart=1 we want to automatically start delivery and show scanner
  const [autoOpenScanner, setAutoOpenScanner] = useState(false);
  const [scanRequested, setScanRequested] = useState(false);
  const [autoStartRequested, setAutoStartRequested] = useState(false);
  // Mode pour scanner le QR code vendeur
  const [scanVendorQRMode, setScanVendorQRMode] = useState(false);

  // Open the scanner with a short delay so the DOM can settle (prevents media play() AbortError)
  const openScannerSafely = () => {
    setOrderModalOpen(false);
    // delay briefly to allow modal to close and DOM to settle
    setTimeout(() => {
      setShowScanSection(true);
      setScanSessionId(s => s + 1);
    }, 160);
  };

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

  // Démarrer la livraison (déplacé ici pour éviter "used before its declaration" dans les useEffect)
  const handleStartDelivery = useCallback(async (skipNavigate = false) => {
    if (!currentOrder) return;
    if (!user?.id) {
      toast({ title: 'Erreur', description: 'Utilisateur non connecté', variant: 'destructive' });
      return;
    }

    try {
      console.log('Démarrage de la livraison pour la commande (via backend):', currentOrder.id);
      if (!currentOrder.id) throw new Error('Order id manquant');

      // Appel backend robuste pour démarrer la livraison (bypass RLS côté client)
      try {
        // Include Authorization header (access token) if available to help backend infer user
        let authHeader: Record<string, string> = {};
        try {
          type SupabaseSessionResp = { data?: { session?: { access_token?: string } } | null; session?: { access_token?: string } | null };
          const sessionResp = await supabase.auth.getSession() as SupabaseSessionResp;
          const token = sessionResp?.data?.session?.access_token || sessionResp?.session?.access_token || null;
          if (token) {
            authHeader = { Authorization: `Bearer ${token}` };
            console.log('[QRScanner] Using auth token for backend call');
          } else {
            console.log('[QRScanner] No auth token available for backend call');
          }
        } catch (e) {
          console.warn('[QRScanner] supabase.getSession() failed:', e);
        }

        const resp = await fetch(apiUrl('/api/orders/mark-in-delivery'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify({ orderId: currentOrder.id, deliveryPersonId: user?.id })
        });
        const json = await resp.json();
        if (!resp.ok || !json || !json.success) {
          console.error('Backend mark-in-delivery failed:', resp.status, json);
          throw new Error(json?.error || json?.message || 'Backend mark-in-delivery failed');
        }

        const updated = json.order ? json.order : { ...(currentOrder as Order), status: 'in_delivery', delivery_person_id: user?.id || currentOrder?.delivery_person_id };
        setCurrentOrder(updated as Order);

        try {
          window.dispatchEvent(new CustomEvent('delivery:started', { detail: { order: updated } }));
        } catch (e) {
          console.warn('Unable to dispatch delivery:started event', e);
        }
        console.log('Livraison démarrée avec succès (backend)', json);
        toast({
          title: 'Commande récupérée',
          description: 'Cliquez sur "Scanner Qrcode Client" pour finaliser la livraison.',
        });

        // Rediriger l'utilisateur vers le dashboard Livraison -> onglet En cours (avec order_id)
        // Si skipNavigate est vrai, on évite la redirection pour rester sur la page scanner.
        try {
          if (!skipNavigate) {
            navigate(`/delivery?tab=in_progress&order_id=${encodeURIComponent(String(currentOrder?.id))}`);
          }
        } catch (e) {
          console.warn('[QRScanner] navigation to /delivery failed:', e);
        }

      } catch (backendErr) {
        console.warn('Backend mark-in-delivery failed, falling back to client update', backendErr);
        const { error } = await supabase
          .from('orders')
          .update({ 
            status: 'in_delivery',
            delivery_person_id: user.id as string
          })
          .eq('id', currentOrder.id as string);

        if (error) {
          console.error('Erreur lors du démarrage de la livraison (fallback client):', error);
          throw error;
        }

        setCurrentOrder(prev => prev ? { ...prev, status: 'in_delivery', delivery_person_id: user?.id || prev.delivery_person_id } : prev);

        // Fallback client: envoyer la notification push au client (si backend indisponible)
        try {
          if (currentOrder?.buyer_id && currentOrder?.id) {
            notifyBuyerDeliveryStarted(
              String(currentOrder.buyer_id),
              String(currentOrder.id),
              currentOrder.order_code || undefined
            ).catch(err => console.warn('[QRScanner] notifyBuyerDeliveryStarted failed:', err));
          }
        } catch (e) {
          console.warn('[QRScanner] notifyBuyerDeliveryStarted error:', e);
        }

        toast({
          title: 'Commande récupérée',
          description: 'Cliquez sur "Scanner Qrcode Client" pour finaliser la livraison.',
        });

        try {
          if (!skipNavigate) {
            navigate(`/delivery?tab=in_progress&order_id=${encodeURIComponent(String(currentOrder?.id))}`);
          }
        } catch (e) {
          console.warn('[QRScanner] navigation to /delivery failed (fallback):', e);
        }
      }
    } catch (error) {
      console.error('Erreur lors du démarrage de la livraison:', error);
      toast({
        title: "Erreur",
        description: "Impossible de démarrer la livraison : " + (error instanceof Error ? error.message : JSON.stringify(error)),
        variant: "destructive",
      });
    }
  }, [currentOrder, user?.id, toast]);

  // Keep a stable ref to the start-delivery handler so other effects can
  // call it without depending on its identity (prevents infinite loops).
  const handleStartDeliveryRef = useRef(handleStartDelivery);
  useEffect(() => {
    handleStartDeliveryRef.current = handleStartDelivery;
  }, [handleStartDelivery]);

  // Si on arrive avec ?orderId=... ou ?orderCode=..., on précharge la commande et ouvre le flux de scan
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('orderId');
    const orderCodeParam = params.get('orderCode');
    const autoStartParam = params.get('autoStart');
    const scanParam = params.get('scan') || params.get('openScanner');
    if (autoStartParam) {
      setAutoStartRequested(true);
      setAutoOpenScanner(true);
    }
    if (scanParam) {
      setScanRequested(true);
      setAutoOpenScanner(true);
    }

    // Helper: try to resolve an order by its code (client first, then backend fallback)
    const resolveByCode = async (code: string) => {
      const cleaned = (code || '').toString().replace(/[^a-z0-9]/gi, '').toUpperCase();
      if (!cleaned) return null;
      try {
        const pattern = `%${cleaned}%`;
        const { data, error } = await supabase
          .from('orders')
          .select(`*, products(name, code), buyer_profile:profiles!orders_buyer_id_fkey(full_name, phone), vendor_profile:profiles!orders_vendor_id_fkey(full_name, phone)`)
          .or(`order_code.ilike.${pattern},qr_code.ilike.${pattern}`)
          .maybeSingle();
        if (!error && data) return data as Order;
      } catch (e) {
        console.warn('resolveByCode supabase error', e);
      }

      // Backend fallback
      try {
        const resp = await fetch(apiUrl('/api/orders/search'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: cleaned })
        });
        const json = await resp.json();
        if (json && json.success && json.order) return json.order as Order;
      } catch (e) {
        console.warn('resolveByCode backend fallback error', e);
      }
      return null;
    };

    (async () => {
      try {
        if (orderId && user?.id) {
          // Prefer fetching by id first (fast path)
          try {
            const { data, error } = await supabase
              .from('orders')
              .select(`*, products(name, code), buyer_profile:profiles!orders_buyer_id_fkey(full_name), vendor_profile:profiles!orders_vendor_id_fkey(phone, wallet_type)`) 
              .eq('id', orderId)
              .maybeSingle();

            if (!error && data) {
              setCurrentOrder(data as Order);
              console.log('Commande chargée depuis URL par id:', data.id);
              // If it's already in delivery and assigned to this user, show modal
              if (data.status === 'in_delivery' && String(data.delivery_person_id) === String(user?.id)) {
                setOrderModalOpen(true);
                return;
              }

              // If paid and autoStart param requested, attempt to start delivery (without auto opening scanner)
              if (data.status === 'paid' && autoStartParam) {
                try {
                  // Use ref-stored handler to avoid recreating the effect when
                  // `handleStartDelivery` identity changes (prevents an infinite loop)
                  await handleStartDeliveryRef.current?.();
                  setOrderModalOpen(true);
                  return;
                } catch (e) {
                  console.warn('Auto start by id failed, will still try code fallback if provided', e);
                }
              }

              // Otherwise show modal
              setOrderModalOpen(true);
              return;
            }
          } catch (e) {
            console.warn('Fetch by id failed:', e);
          }
        }

        // If we didn't resolve by id and an orderCode param is available, try to resolve by code
        if (orderCodeParam) {
          const found = await resolveByCode(orderCodeParam);
          if (found) {
            setCurrentOrder(found as Order);
            console.log('Commande chargée depuis URL par code:', found.id);

            if (found.status === 'in_delivery' && String(found.delivery_person_id) === String(user?.id)) {
              setOrderModalOpen(true);
              return;
            }

            if (found.status === 'paid' && autoStartParam) {
              try {
                await handleStartDeliveryRef.current?.();
                setOrderModalOpen(true);
                return;
              } catch (e) {
                console.warn('Auto start by code failed, falling back to modal', e);
              }
            }

            setOrderModalOpen(true);
            return;
          }
        }

        // If we reach here and nothing resolved, leave the page in search mode
      } catch (e) {
        console.warn('Error resolving order params', e);
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

      // 1. Recherche Supabase classique
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
        setCurrentOrder(data as Order);
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

        const codeVal = matchType === 'qr_code' ? (data.qr_code ?? data.order_code ?? '') : (data.order_code ?? data.qr_code ?? '');
        setLastMatchInfo({ type: matchType, code: codeVal });
        
        console.log('Commande trouvée:', data, 'matchType:', matchType, 'statut:', data.status);
        
        // Afficher le modal avec les détails de la commande (pas le scan directement)
        setOrderModalOpen(true);
        
        toast({
          title: "Commande trouvée",
          description: `Commande ${data.order_code} trouvée. Cliquez sur "Commencer à livrer" pour démarrer.`,
        });
        return;
      }

      // 2. Fallback : requête backend (si jamais RLS ou policies bloquent côté client)
      try {
        const resp = await fetch(apiUrl('/api/orders/search'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: cleaned })
        });
        const json = await resp.json();
        console.log('[Fallback backend] Résultat:', json);
        if (json && json.success && json.order) {
          setCurrentOrder(json.order as Order);
          setLastMatchInfo({ type: 'order_code', code: json.order.order_code ?? '' });
          setOrderModalOpen(true);
          toast({
            title: "Commande trouvée (backend)",
            description: `Commande ${json.order.order_code} trouvée via backend. Cliquez sur "Commencer à livrer" pour démarrer.`,
          });
          return;
        }
        // Si backend répond mais pas de commande
        toast({
          title: "Commande non trouvée",
          description: `Aucune commande trouvée avec ce code. Vérifiez le code et le statut.`,
          variant: "destructive",
        });
      } catch (e) {
        console.error('[Fallback backend] Erreur:', e);
        toast({
          title: "Erreur réseau",
          description: "Impossible de contacter le backend pour la recherche de commande.",
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
    } finally {
      setIsScanning(false);
    }
  };

  // Fonction pour scanner le QR code vendeur
  const handleScanVendorQR = () => {
    setScanVendorQRMode(true);
    setShowScanSection(true);
    setScanSessionId(s => s + 1);
  };

  

  const handleScanQR = async (code, resetScan) => {
    const codeToCheck = code !== undefined ? code : scannedCode;
    console.log('handleScanQR appelé, codeToCheck =', codeToCheck, 'scanVendorQRMode =', scanVendorQRMode);
    
    // Si on est en mode scan QR vendeur, chercher la commande PAR ORDER_CODE UNIQUEMENT
    if (scanVendorQRMode) {
      try {
        const cleaned = codeToCheck.trim().replace(/[^a-z0-9]/gi, '').toUpperCase();
        
        console.log('[QRScanner] 🔍 Recherche commande VENDEUR - code scanné:', codeToCheck);
        console.log('[QRScanner] 🔍 Code nettoyé:', cleaned);
        console.log('[QRScanner] ℹ️ Recherche dans order_code ET qr_code avec ilike pour tolérance');
        
        // Debug: voir toutes les commandes avec ce order_code (recherche flexible)
        const { data: allMatches, error: debugError } = await supabase
          .from('orders')
          .select('id, order_code, qr_code, status')
          .or(`order_code.ilike.%${cleaned}%,qr_code.ilike.%${cleaned}%`);
        
        console.log('[QRScanner] 📊 Commandes correspondant au code', cleaned, ':', allMatches);
        
        // Recherche tolérante: order_code OU qr_code avec ilike + statuts valides
        let data: Order | null = null;
        let error: any = null;
        
        // 1) D'abord, recherche exacte sur order_code
        console.log('[QRScanner] 🔎 Recherche order_code exact avec statuts [paid, assigned, in_delivery]...');
        let result = await supabase
          .from('orders')
          .select(`
            *,
            products(name, code),
            buyer_profile:profiles!orders_buyer_id_fkey(full_name),
            vendor_profile:profiles!orders_vendor_id_fkey(phone, wallet_type)
          `)
          .eq('order_code', cleaned)
          .in('status', ['paid', 'assigned', 'in_delivery'])
          .maybeSingle();
        
        console.log('[QRScanner] Résultat recherche exacte:', { found: !!result.data, status: result.data?.status, error: result.error });
        
        data = result.data;
        error = result.error;

        // 2) Si pas trouvé, recherche avec ilike (tolérante) sur order_code ET qr_code
        if (!data && !error) {
          console.log('[QRScanner] 🔎 Recherche tolérante avec ilike...');
          result = await supabase
            .from('orders')
            .select(`
              *,
              products(name, code),
              buyer_profile:profiles!orders_buyer_id_fkey(full_name),
              vendor_profile:profiles!orders_vendor_id_fkey(phone, wallet_type)
            `)
            .or(`order_code.ilike.%${cleaned}%,qr_code.ilike.%${cleaned}%`)
            .in('status', ['paid', 'assigned', 'in_delivery'])
            .limit(1)
            .maybeSingle();
          
          console.log('[QRScanner] Résultat recherche tolérante:', { found: !!result.data, status: result.data?.status, error: result.error });
          data = result.data;
          error = result.error;
        }

        // 3) Si toujours pas trouvé, fallback backend
        if (!data && !error) {
          console.log('[QRScanner] 🔎 Fallback vers backend /api/orders/search...');
          try {
            const resp = await fetch(apiUrl('/api/orders/search'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: cleaned })
            });
            const json = await resp.json();
            console.log('[QRScanner] Résultat backend:', json);
            if (json && json.success && json.order) {
              data = json.order as Order;
            }
          } catch (e) {
            console.error('[QRScanner] Erreur fallback backend:', e);
          }
        }

        if (error || !data) {
          console.error('[QRScanner] ❌ Aucune commande trouvée. Erreur:', error);
          console.error('[QRScanner] 💡 Code scanné:', codeToCheck, '-> nettoyé:', cleaned);
          toast({
            title: "Commande non trouvée",
            description: `Aucune commande ne correspond à ce QR code. Code scanné: ${cleaned.substring(0, 10)}...`,
            variant: "destructive",
          });
          if (resetScan) resetScan();
          return;
        }
        
        console.log('[QRScanner] ✅ Commande trouvée:', { id: data.id, order_code: data.order_code, status: data.status });

        // Commande trouvée via QR commande
        setCurrentOrder(data as Order);
        setLastMatchInfo({ type: 'order_code', code: data.order_code ?? '' });
        setScanVendorQRMode(false);
        setShowScanSection(false);
        setOrderModalOpen(true);
        
        toast({
          title: "Commande trouvée",
          description: `Commande ${data.order_code} trouvée via QR code commande`,
        });
        return;
      } catch (error) {
        console.error('Erreur scan QR vendeur:', error);
        toast({
          title: "Erreur",
          description: "Erreur lors de la recherche de la commande",
          variant: "destructive",
        });
        if (resetScan) resetScan();
        return;
      }
    }
    
    // Mode normal : scan du QR code client
    if (!codeToCheck.trim()) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer ou scanner un code QR",
        variant: "destructive",
      });
      return;
    }

    // If we don't have a currentOrder, try to resolve the order by the scanned QR code
    if (!currentOrder) {
      console.log('No currentOrder; attempting to find order by QR code');
      try {
        const normalize = (s) => (s || '').toString().replace(/[^a-z0-9]/gi, '').toUpperCase();
        const scannedNormalized = normalize(codeToCheck);
        // Query supabase for orders with matching qr_code (tolerant match)
        const { data: found, error: findErr } = await supabase
          .from('orders')
          .select(`*, products(name, code), buyer_profile:profiles!orders_buyer_id_fkey(full_name, phone), vendor_profile:profiles!orders_vendor_id_fkey(full_name, phone)`)
          .ilike('qr_code', `%${scannedNormalized}%`)
          .in('status', ['assigned', 'in_delivery', 'paid', 'delivered'])
          .limit(1)
          .maybeSingle();

        if (findErr) {
          console.warn('Error searching order by QR:', findErr);
        }
        if (found && found.id) {
          console.log('Order found by QR:', found.id, 'status:', found.status);
          setCurrentOrder(found as Order);
          // proceed with normal validation against that order
        } else {
          toast({ title: 'Commande introuvable', description: 'Aucune commande associée à ce QR code.', variant: 'destructive' });
          return;
        }
      } catch (e) {
        console.error('Error resolving order by QR:', e);
        toast({ title: 'Erreur', description: 'Impossible de vérifier la commande pour ce QR.', variant: 'destructive' });
        return;
      }
    }

    try {
      console.log('QRScanner: code scanné =', codeToCheck, 'QR attendu =', currentOrder?.qr_code);
      // Normaliser les codes (supprimer espaces, tirets et non-alphanumériques, mettre en majuscule)
      const normalize = (s) => (s || '').toString().replace(/[^a-z0-9]/gi, '').toUpperCase();
      const scannedNormalized = normalize(codeToCheck);
      const expectedNormalized = normalize(currentOrder?.qr_code);
      // Vérifier que le QR code correspond à la commande en cours
      if (scannedNormalized !== expectedNormalized) {
        throw new Error('QR code ne correspond pas à la commande');
      }
      // Vérifier que c'est bien le livreur assigné
      if (currentOrder?.delivery_person_id !== user?.id) {
        throw new Error('Vous n\'êtes pas le livreur assigné à cette commande');
      }
      setValidationResult({
        ...(currentOrder as Order),
        status: 'valid',
        timestamp: new Date().toLocaleString()
      });
      console.log('QRScanner: validation OK, commande id =', currentOrder?.id, 'vendor_profile:', currentOrder?.vendor_profile);
      toast({
        title: "QR Code valide",
        description: `Livraison confirmée pour ${currentOrder?.buyer_profile?.full_name}`,
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
        
        // 1) Marquer la commande comme delivered via backend (évite RLS côté client)
        let updatedOrder: Order | null = null;
        try {
          const resp = await fetch(apiUrl('/api/orders/mark-delivered'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: validationResult.id, deliveredBy: user?.id })
          });
          const json = await resp.json().catch(() => ({}));
          console.log('QRScanner: mark-delivered response', resp.status, json);
          if (!resp.ok || !json || !json.success) {
            // If backend failed, fall back to client update (best-effort)
            console.warn('QRScanner: backend mark-delivered failed, attempting client-side update as fallback', json);
            const { error: updateError, data: updatedOrders } = await supabase
              .from('orders')
              .update({ status: 'delivered', delivered_at: new Date().toISOString() })
              .eq('id', validationResult.id as string)
              .select();
            if (updateError) {
              console.error('QRScanner: ERREUR mise à jour statut delivered (fallback):', updateError);
              throw new Error(json?.error || updateError.message || 'Erreur mise à jour statut');
            }
            if (!updatedOrders || updatedOrders.length === 0) {
              throw new Error('Commande non mise à jour - aucune donnée retournée. Vérifiez les politiques RLS.');
            }
            updatedOrder = updatedOrders[0];
          } else {
            // Backend returns success; updated info may be in json.updated or json.order
            updatedOrder = json.order || json.updated || { id: validationResult.id, status: 'delivered' };
          }
        } catch (e) {
          console.error('QRScanner: erreur lors du mark-delivered backend+fallback flow:', e);
          throw e;
        }
        console.log('QRScanner: ✅ Statut mis à jour avec succès - Commande livrée:', updatedOrder?.status || 'delivered');

        // Notifier vendeur + acheteur que la livraison est terminée
        notifyDeliveryCompleted(
          validationResult.vendor_id as string,
          validationResult.buyer_id as string,
          validationResult.id as string,
          validationResult.order_code || undefined
        ).catch(err => console.warn('Notification livraison terminée échouée:', err));

        // 2) Afficher message de succès immédiat
        // Informer le livreur que la commande est marquée livrée mais que le paiement
        // au vendeur nécessite la validation d'un administrateur.
        toast({
          title: "✅ Livraison validée",
          description: "La commande a été marquée comme livrée. Le paiement au vendeur est en attente de validation par un administrateur.",
        });

        // 3) Notifier les admins pour validation (tentative fire-and-forget)
        (async () => {
          try {
            await fetch(apiUrl('/api/notify/admin-delivery-request'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId: validationResult.id })
            });
          } catch (e) {
            console.warn('Erreur notification admin:', e);
          }
        })();

        // Nettoyage de l'UI et confirmation locale
        setValidationResult(null);
        setScannedCode('');
        setOrderCode('');
        // Keep scanner open for the next delivery and reset session so scanner resumes
        setCurrentOrder(null);
        openScannerSafely();
        setIsConfirmingDelivery(false);
        // Return to delivery dashboard so the driver sees the updated 'Terminé' tab
        try { navigate('/delivery'); } catch (e) { /* ignore */ }
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
        setScannedCode(currentOrder.qr_code || '');
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
    if (!currentOrder) return;

    // Si la commande est déjà en cours et assignée à ce livreur,
    // afficher la modale de détails ; ne pas ouvrir le scanner automatiquement.
    if (currentOrder.status === 'in_delivery' && String(currentOrder.delivery_person_id) === String(user?.id)) {
      setOrderModalOpen(true);
      return;
    }

    // Cas normal : afficher la modale
    setOrderModalOpen(true);
  }, [currentOrder, user?.id]);

  // If the URL requested auto-start scanning (e.g. ?autoStart=1), start the delivery but do not open the scanner directly
  useEffect(() => {
    if (!autoOpenScanner || !currentOrder || !user?.id) return;
    (async () => {
      try {
        // If the order is already in_delivery and assigned to *this* user, show modal
        if (currentOrder.status === 'in_delivery') {
          if (String(currentOrder.delivery_person_id) === String(user.id)) {
            // If autoOpenScanner requested, open the scanner directly instead of showing the modal
            if (autoOpenScanner) {
              try {
                openScannerSafely();
              } catch (e) {
                console.warn('[QRScanner] auto open scanner failed, falling back to modal', e);
                setOrderModalOpen(true);
              }
            } else {
              setOrderModalOpen(true);
            }
          } else {
            // Order is in delivery by another person — inform and do not open scanner
            toast({ title: 'Commande non disponible', description: 'Cette commande est déjà prise en charge par un autre livreur.', variant: 'destructive' });
          }
        } else if (currentOrder.status === 'paid') {
          // Paid: if navigation requested (autoStart) then start delivery and show modal (legacy behavior).
          // If the user specifically requested scanning (scanRequested) we should assign the order
          // but avoid redirecting so we can immediately open the scanner.
          if (autoStartRequested) {
            try {
              await handleStartDelivery();
              setOrderModalOpen(true);
            } catch (startErr) {
              console.warn('Auto-start delivery failed, keeping modal visible:', startErr);
              setOrderModalOpen(true);
            }
          } else if (scanRequested) {
            try {
              // assign but do not navigate away
              await handleStartDelivery(true);
              // open scanner immediately
              try {
                openScannerSafely();
              } catch (e) {
                console.warn('[QRScanner] failed to open scanner after silent assign:', e);
                setOrderModalOpen(true);
              }
            } catch (startErr) {
              console.warn('Silent assign failed, showing modal instead:', startErr);
              setOrderModalOpen(true);
            }
          } else {
            // default fallback: show modal
            setOrderModalOpen(true);
          }
        } else if (currentOrder.status === 'delivered') {
          // Already delivered: do not open scanner, inform the user
          toast({ title: 'Commande déjà livrée', description: 'Cette commande est déjà marquée comme livrée.', variant: 'default' });
          // Ensure we do not open the scanner
          setOrderModalOpen(false);
          setShowScanSection(false);
        } else {
          // Other statuses are not appropriate to auto-open scanner
          toast({ title: 'Commande non prête', description: 'Impossible d\'ouvrir le scanner pour cette commande.', variant: 'destructive' });
        }
      } finally {
        setAutoOpenScanner(false);
      }
    })();
  }, [autoOpenScanner, currentOrder, handleStartDelivery, toast, user?.id]);

  // Redirection automatique après succès
  // Removed automatic redirect after confirmation so scanner can continue scanning
  // useEffect(() => {
  //   if (!deliveryConfirmed) return;
  //   const t = setTimeout(() => navigate('/delivery'), 3000);
  //   return () => clearTimeout(t);
  // }, [deliveryConfirmed, navigate]);

  return (
    <div className="min-h-screen bg-primary/10">
      {/* Bandeau de progression paiement vendeur */}

      {/* Header */}
      <div className="w-full bg-primary shadow-sm">
        <div className="max-w-md mx-auto px-4">
          <div className="flex h-16 items-center justify-center gap-3">
            <img
              src={valideLogo}
              alt="Validèl"
              className="h-8 w-8 object-contain"
            />
            <h1 className="text-xl font-semibold tracking-tight text-primary-foreground">Validèl</h1>
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
                <span className="font-semibold">Code commande:</span> <span className="bg-primary/10 text-primary text-sm font-medium px-3 py-1 rounded">{currentOrder?.order_code}</span>
              </div>
            </DialogDescription>
          </DialogHeader>
          {currentOrder?.status === 'paid' && (
            <div className="mt-2">
              <p className="text-gray-600 mb-4 text-center">Cliquez sur le bouton ci-dessous pour commencer la livraison</p>
                  <Button onClick={() => handleStartDelivery()} className="w-full bg-primary text-primary-foreground rounded-xl">
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
            {/* Bouton Scanner QR Commande - En haut */}
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

            {/* Recherche manuelle par code - En bas */}
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
          />
        )}
      </div>
    </div>
  );
};

export default QRScanner;
