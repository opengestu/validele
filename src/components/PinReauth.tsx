import React, { useState, useEffect } from 'react';
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockRemainingSeconds, setLockRemainingSeconds] = useState<number>(0);
  const [phone, setPhone] = useState<string | null>(null);
  const [maskedPhone, setMaskedPhone] = useState<string>('');
  const [forgotPinClicks, setForgotPinClicks] = useState<number>(0);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signOut } = useAuth();

  const getPhoneKey = (rawPhone: string | null) => String(rawPhone || '').replace(/\D/g, '');

  const readForgotPinClicks = (rawPhone: string | null) => {
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
  };

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
  }, [navigate]);

  const handlePinComplete = async (pin: string) => {
    if (!phone) return;
    if (lockRemainingSeconds > 0) {
      setError(`Trop de tentatives PIN. Réessayez dans ${formatLockDuration(lockRemainingSeconds)}.`);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(apiUrl('/auth/login-pin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        // Mettre à jour le token
        if (data.token) {
          localStorage.setItem('auth_token', data.token);
        }

        // Mettre à jour la session SMS avec le nouveau token si nécessaire
        const smsSessionStr = localStorage.getItem('sms_auth_session');
        if (smsSessionStr) {
          try {
            const smsSession = JSON.parse(smsSessionStr);
            if (data.token) {
              smsSession.access_token = data.token;
            }
            smsSession.loginTime = new Date().toISOString();
            localStorage.setItem('sms_auth_session', JSON.stringify(smsSession));
          } catch {
            // ignore
          }
        }

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
      } else {
        const retryAfterSeconds = Number.parseInt(String(data?.retry_after_seconds ?? ''), 10);
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
          setLockRemainingSeconds(retryAfterSeconds);
          setError(`Trop de tentatives PIN. Réessayez dans ${formatLockDuration(retryAfterSeconds)}.`);
          setLoading(false);
          return;
        }
        const backendError = (data && typeof data.error === 'string' && data.error.trim().length > 0)
          ? data.error
          : null;
        setError(backendError || 'Code PIN incorrect. Veuillez réessayer.');
        setLoading(false);
      }
    } catch (e) {
      console.error('PinReauth error:', e);
      setError('Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.');
      setLoading(false);
    }
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
      <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-white/30 backdrop-blur-[2px]">
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen items-center justify-center px-4" style={{ background: 'transparent' }}>
      {/* Logo */}
      <div className="mb-6">
        <img
          src={validelLogo}
          alt="Validèl"
          className="w-16 h-16 mx-auto"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>

      {/* Titre */}
      <div className="text-center mb-8">
        <p className="text-sm text-gray-500">
          Entrez votre code PIN pour deverouiller
        </p>
        {maskedPhone && (
          <p className="text-xs text-gray-400 mt-1">
            {maskedPhone}
          </p>
        )}
      </div>

      {/* Erreur */}
      {error && (
        <div className="w-full max-w-xs mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600 text-center">{error}</p>
        </div>
      )}

      {lockRemainingSeconds > 0 && (
        <div className="w-full max-w-xs mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-700 text-center">
            Nouvelle tentative dans {formatLockDuration(lockRemainingSeconds)}
          </p>
        </div>
      )}

      {/* PIN Input */}
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <Spinner size="sm" />
          <p className="text-sm text-gray-500">Vérification...</p>
        </div>
      ) : lockRemainingSeconds > 0 ? (
        <div className="w-full max-w-xs py-6">
          <p className="text-sm text-center text-gray-500">
            Saisie temporairement bloquée
          </p>
        </div>
      ) : (
        <div className="w-full max-w-xs">
          <PinInput onComplete={handlePinComplete} />
        </div>
      )}

      {/* Actions secondaires */}
      <div className="mt-8 flex items-center gap-4">
        {showForgotPinButton && (
          <button
            onClick={handleForgotPin}
            className="text-sm text-gray-500 hover:text-gray-700 underline transition-colors"
          >
            PIN oublié ?
          </button>
        )}
        <button
          onClick={handleOpenSupportWhatsApp}
          className="text-sm text-gray-500 hover:text-gray-700 underline transition-colors"
        >
          Support
        </button>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-400 hover:text-gray-600 underline transition-colors"
        >
          Changer de compte
        </button>
      </div>
    </div>
  );
};

export default PinReauth;
