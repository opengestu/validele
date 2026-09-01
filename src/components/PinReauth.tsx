import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PinInput from './auth/PinInput';
import { useToast } from '@/hooks/use-toast';
import { apiUrl } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';
import { REAUTH_RETURN_PATH_KEY, REAUTH_REQUIRED_KEY, LAST_ACTIVITY_KEY } from './SessionTimeoutManager';
import { useAuth } from '@/hooks/useAuth';
import validelLogo from '@/assets/validel-logo.png';

/**
 * Page de re-authentification par PIN.
 * Affichée quand la session expire par inactivité ou sur erreur 401.
 * L'utilisateur entre son PIN, un nouveau token est obtenu, et il est redirigé
 * vers la page où il était.
 */
const PinReauth: React.FC = () => {
  const FORGOT_PIN_CLICKS_KEY = 'pin_forgot_clicks_v1';
  const MAX_FORGOT_PIN_CLICKS = 1;
  const SUPPORT_PHONE = '777804136';
  const PIN_HASH_KEY = 'pin_hash_v1';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockRemainingSeconds, setLockRemainingSeconds] = useState<number>(0);
  const [phone, setPhone] = useState<string | null>(null);
  const [maskedPhone, setMaskedPhone] = useState<string>('');
  const [forgotPinClicks, setForgotPinClicks] = useState<number>(0);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signOut } = useAuth();

  // Fonction pour hasher le PIN avec SHA-256
  const hashPin = async (pin: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hash));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  };

  const getPhoneKey = useCallback((rawPhone: string | null) => String(rawPhone || '').replace(/\D/g, ''), []);

  const readForgotPinClicks = useCallback((rawPhone: string | null) => {
    const phoneKey = getPhoneKey(rawPhone);
    if (!phoneKey) return 0;
    try {
      const raw = localStorage.getItem(FORGOT_PIN_CLICKS_KEY);
      if (!raw) return 0;
      const parsed = JSON.parse(raw) as Record<string, number>;
      const value = Number(parsed[phoneKey] ?? 0);
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    } catch {
      return 0;
    }
  }, [getPhoneKey]);

  const saveForgotPinClicks = (rawPhone: string | null, value: number) => {
    const phoneKey = getPhoneKey(rawPhone);
    if (!phoneKey) return;
    try {
      const raw = localStorage.getItem(FORGOT_PIN_CLICKS_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      parsed[phoneKey] = Math.max(0, value);
      localStorage.setItem(FORGOT_PIN_CLICKS_KEY, JSON.stringify(parsed));
    } catch {
      // ignore storage errors
    }
  };

  const formatLockDuration = (totalSeconds: number) => {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  useEffect(() => {
    if (lockRemainingSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setLockRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [lockRemainingSeconds]);

  useEffect(() => {
    // Récupérer le numéro de téléphone depuis la session SMS
    const smsSessionStr = localStorage.getItem('sms_auth_session');
    if (smsSessionStr) {
      try {
        const smsSession = JSON.parse(smsSessionStr);
        const rawPhone = smsSession.phone || '';
        setPhone(rawPhone);
        setForgotPinClicks(readForgotPinClicks(rawPhone));
        // Masquer le numéro pour la sécurité: +221 7X XXX XX XX → +221 7X *** ** XX
        const digits = rawPhone.replace(/\D/g, '');
        if (digits.length >= 9) {
          const last2 = digits.slice(-2);
          const first4 = digits.slice(0, Math.min(digits.length, digits.length - 5));
          setMaskedPhone(`+${first4}*****${last2}`);
        } else {
          setMaskedPhone(rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`);
        }
      } catch {
        // Pas de session valide, rediriger vers /auth
        localStorage.removeItem(REAUTH_REQUIRED_KEY);
        localStorage.removeItem(REAUTH_RETURN_PATH_KEY);
        localStorage.removeItem('app_backgrounded_at');
        navigate('/auth', { replace: true });
      }
    } else {
      // Pas de session SMS, rediriger vers la page d'authentification
      localStorage.removeItem(REAUTH_REQUIRED_KEY);
      localStorage.removeItem(REAUTH_RETURN_PATH_KEY);
      localStorage.removeItem('app_backgrounded_at');
      navigate('/auth', { replace: true });
    }
  }, [navigate, readForgotPinClicks]);

  // Renouvellement du jeton auprès du serveur. C'est la raison d'être de cet
  // écran : sans NOUVEAU JWT, l'utilisateur retrouve une interface déverrouillée
  // alors que chaque appel backend continue de répondre 401, d'où le bandeau
  // « Session invalide ou expirée » juste après un PIN pourtant accepté.
  type TokenRenewal =
    | { status: 'ok' }
    | { status: 'invalid-pin' }
    | { status: 'locked'; retryAfterSeconds: number }
    | { status: 'offline' };

  const renewSessionToken = async (pinValue: string): Promise<TokenRenewal> => {
    let res: Response;
    try {
      res = await fetch(apiUrl('/auth/login-pin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin: pinValue }),
      });
    } catch {
      return { status: 'offline' };
    }

    const data = (await res.json().catch(() => ({}))) as {
      token?: string;
      retry_after_seconds?: number;
    };

    if (res.status === 429) {
      return { status: 'locked', retryAfterSeconds: Math.max(1, Number(data.retry_after_seconds) || 60) };
    }
    if (!res.ok || !data.token) {
      return { status: 'invalid-pin' };
    }

    localStorage.setItem('auth_token', data.token);
    // resolveAuthToken() lit `sms_auth_session` EN PREMIER (src/lib/api.ts) :
    // n'écrire que `auth_token` laisserait l'ancien JWT expiré prioritaire, et
    // le problème resterait entier.
    try {
      const raw = localStorage.getItem('sms_auth_session');
      if (raw) {
        const smsSession = JSON.parse(raw);
        smsSession.access_token = data.token;
        smsSession.loginTime = new Date().toISOString();
        localStorage.setItem('sms_auth_session', JSON.stringify(smsSession));
      }
    } catch {
      // ignore
    }
    return { status: 'ok' };
  };

  const handlePinComplete = async (pin: string) => {
    if (!phone) return;
    if (lockRemainingSeconds > 0) {
      setError(`Trop de tentatives PIN. Réessayez dans ${formatLockDuration(lockRemainingSeconds)}.`);
      return;
    }
    setLoading(true);
    setError(null);

    const fail = (message: string) => {
      setError(message);
      setLoading(false);
    };

    try {
      const phoneKey = getPhoneKey(phone);
      const storedHash = localStorage.getItem(`${PIN_HASH_KEY}_${phoneKey}`);
      const inputHash = await hashPin(pin);

      // Le hash local est un filet HORS LIGNE, jamais un raccourci : il évite un
      // aller-retour réseau sur un PIN manifestement faux, mais dès qu'il y a du
      // réseau c'est le serveur qui tranche ET qui délivre le jeton.
      if (storedHash && inputHash !== storedHash) {
        fail('Code PIN incorrect. Veuillez réessayer.');
        return;
      }

      const renewal = await renewSessionToken(pin);

      if (renewal.status === 'locked') {
        setLockRemainingSeconds(renewal.retryAfterSeconds);
        fail(`Trop de tentatives PIN. Réessayez dans ${formatLockDuration(renewal.retryAfterSeconds)}.`);
        return;
      }

      if (renewal.status === 'invalid-pin') {
        // Le hash local correspondait mais pas le serveur : le PIN a été changé
        // ailleurs. On jette le hash périmé pour que la prochaine tentative
        // reparte de la source de vérité.
        localStorage.removeItem(`${PIN_HASH_KEY}_${phoneKey}`);
        fail('Code PIN incorrect. Veuillez réessayer.');
        return;
      }

      if (renewal.status === 'offline') {
        // Sans hash local, rien ne permet de vérifier le PIN hors ligne.
        if (!storedHash) {
          fail('Pas de connexion internet. Veuillez vous connecter pour la première vérification.');
          return;
        }
        // Tolérance hors ligne volontaire : on déverrouille l'interface, mais le
        // jeton n'a PAS pu être renouvelé — les appels backend resteront refusés
        // tant que le réseau n'est pas revenu.
        console.warn('[PinReauth] hors ligne : session déverrouillée sans renouvellement du jeton');
        completeReauth();
        return;
      }

      // Jeton renouvelé : on (re)mémorise le hash pour les vérifications hors ligne.
      localStorage.setItem(`${PIN_HASH_KEY}_${phoneKey}`, inputHash);
      completeReauth();
    } catch (e) {
      console.error('PinReauth error:', e);
      fail('Code PIN incorrect. Veuillez réessayer.');
    }
  };

  const completeReauth = () => {
    // Réinitialiser les compteurs d'activité
    localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
    localStorage.removeItem('app_backgrounded_at');
    localStorage.removeItem(REAUTH_REQUIRED_KEY);

    toast({
      title: 'Session renouvelée',
      description: 'Vous êtes reconnecté.',
    });

    // Rediriger vers la page précédente
    const returnPath = localStorage.getItem(REAUTH_RETURN_PATH_KEY);
    localStorage.removeItem(REAUTH_RETURN_PATH_KEY);

    const resolveSafeReturnPath = (rawPath: string | null) => {
      if (!rawPath) return null;
      try {
        const parsed = new URL(rawPath, window.location.origin);
        const pathname = parsed.pathname;
        if (pathname === '/pin-reauth' || pathname === '/auth') return null;
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      } catch {
        if (rawPath.startsWith('/pin-reauth') || rawPath.startsWith('/auth')) return null;
        return rawPath;
      }
    };

    const safeReturnPath = resolveSafeReturnPath(returnPath);

    if (safeReturnPath) {
      navigate(safeReturnPath, { replace: true });
    } else {
      // Redirection par défaut selon le rôle
      const smsStr = localStorage.getItem('sms_auth_session');
      if (smsStr) {
        try {
          const sess = JSON.parse(smsStr);
          const role = sess.role || 'buyer';
          const path = role === 'vendor' ? '/vendor' : role === 'delivery' ? '/delivery' : '/buyer';
          navigate(path, { replace: true });
        } catch {
          navigate('/buyer', { replace: true });
        }
      } else {
        navigate('/', { replace: true });
      }
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    localStorage.removeItem(REAUTH_RETURN_PATH_KEY);
    localStorage.removeItem(REAUTH_REQUIRED_KEY);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    localStorage.removeItem('app_backgrounded_at');
    await signOut();
    navigate('/auth', { replace: true });
  };

  const handleForgotPin = () => {
    if (forgotPinClicks >= MAX_FORGOT_PIN_CLICKS) {
      const supportMessage = 'Vous avez deja utilise la reinitialisation PIN. Veuillez appeler le support.';
      setError(supportMessage);
      toast({
        title: 'Support requis',
        description: supportMessage,
      });
      return;
    }

    const nextClicks = forgotPinClicks + 1;
    saveForgotPinClicks(phone, nextClicks);
    setForgotPinClicks(nextClicks);

    const queryPhone = phone ? `&phone=${encodeURIComponent(phone)}` : '';
    navigate(`/auth?resetPin=1${queryPhone}`, { replace: true });
  };

  const showForgotPinButton =
    lockRemainingSeconds > 0 || (error ? error.toLowerCase().includes('trop de tentatives pin') : false);

  const handleOpenSupportWhatsApp = () => {
    const waUrl = `https://wa.me/221${SUPPORT_PHONE}`;
    try {
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    } catch {
      window.location.href = waUrl;
    }
  };

  if (!phone) {
    return (
      <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 px-6">
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    <>
      {/* Full-screen overlay when loading */}
      {loading && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 px-6">
          <Spinner size="sm" />
        </div>
      )}

      <div className="relative flex h-[100dvh] items-center justify-center overflow-hidden bg-slate-50 px-3 py-3">

        <div
          className="relative z-10 w-full max-w-[420px] max-h-[calc(100dvh-24px)] overflow-visible rounded-[28px] border-none bg-white p-3 shadow-none sm:p-4"
          style={{ transform: 'translateY(clamp(28px, 7vh, 58px))' }}
        >
        <div className="relative z-20 -translate-y-24 sm:-translate-y-28">
          <div className="mb-3 mt-0 flex flex-col items-center text-center">
            <div className="relative z-30 mb-2 flex h-20 w-20 items-center justify-center">
              <img
                src={validelLogo}
                alt="Validèl"
                className="h-20 w-20 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          </div>

          <div className="mb-3 text-center">
            <p className="text-sm font-medium text-slate-700">
              Entrez votre code PIN pour déverrouiller
            </p>
            {maskedPhone && (
              <p className="mt-1 text-xs text-slate-500">
                {maskedPhone}
              </p>
            )}
          </div>

          {error && (
            <div className="mb-2 rounded-2xl border border-red-200 bg-red-50/90 p-2.5">
              <p className="text-center text-sm text-red-600">{error}</p>
            </div>
          )}

          {lockRemainingSeconds > 0 && (
            <div className="mb-2 rounded-2xl border border-amber-200 bg-amber-50/90 p-2.5">
              <p className="text-center text-sm text-amber-700">
                Nouvelle tentative dans {formatLockDuration(lockRemainingSeconds)}
              </p>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-5">
            <Spinner size="sm" />
            <p className="text-sm text-slate-600">Vérification...</p>
          </div>
        ) : lockRemainingSeconds > 0 ? (
          <div className="w-full py-5">
            <p className="text-center text-sm text-slate-600">
              Saisie temporairement bloquée
            </p>
          </div>
        ) : (
          <div className="mt-8 sm:mt-8 w-full">
            <PinInput onComplete={handlePinComplete} />
          </div>
        )}

      {/* Actions secondaires */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {showForgotPinButton && (
          <button
            onClick={handleForgotPin}
            className="whitespace-nowrap text-xs font-medium text-slate-600 underline transition-colors hover:text-slate-900"
          >
            PIN oublié ?
          </button>
        )}
        <button
          onClick={handleOpenSupportWhatsApp}
          className="whitespace-nowrap text-xs font-medium text-slate-600 underline transition-colors hover:text-slate-900"
        >
          Support
        </button>
        <button
          onClick={handleLogout}
          className="whitespace-nowrap text-xs font-medium text-slate-500 underline transition-colors hover:text-slate-800"
        >
          Changer de compte
        </button>
      </div>
      </div>
    </div>
    </>
  );
};

export default PinReauth;
