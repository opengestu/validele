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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [maskedPhone, setMaskedPhone] = useState<string>('');
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signOut } = useAuth();

  useEffect(() => {
    // Récupérer le numéro de téléphone depuis la session SMS
    const smsSessionStr = localStorage.getItem('sms_auth_session');
    if (smsSessionStr) {
      try {
        const smsSession = JSON.parse(smsSessionStr);
        const rawPhone = smsSession.phone || '';
        setPhone(rawPhone);
        // Masquer le numéro pour la sécurité: +221 7X XXX XX XX → +221 7X *** ** XX
        const digits = rawPhone.replace(/\D/g, '');
        if (digits.length >= 9) {
          const last2 = digits.slice(-2);
          const first4 = digits.slice(0, Math.min(digits.length, digits.length - 5));
          setMaskedPhone(`${first4}*****${last2}`);
        } else {
          setMaskedPhone(rawPhone);
        }
      } catch {
        // Pas de session valide, rediriger vers /auth
        navigate('/auth', { replace: true });
      }
    } else {
      // Pas de session SMS, rediriger vers la page d'authentification
      navigate('/auth', { replace: true });
    }
  }, [navigate]);

  const handlePinComplete = async (pin: string) => {
    if (!phone) return;
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

        if (returnPath && returnPath !== '/pin-reauth' && returnPath !== '/auth') {
          navigate(returnPath, { replace: true });
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
        setError('Code PIN incorrect. Veuillez réessayer.');
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
    const queryPhone = phone ? `&phone=${encodeURIComponent(phone)}` : '';
    navigate(`/auth?resetPin=1${queryPhone}`, { replace: true });
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

      {/* PIN Input */}
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <Spinner size="sm" />
          <p className="text-sm text-gray-500">Vérification...</p>
        </div>
      ) : (
        <div className="w-full max-w-xs">
          <PinInput onComplete={handlePinComplete} />
        </div>
      )}

      {/* Actions secondaires */}
      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={handleForgotPin}
          className="text-sm text-gray-500 hover:text-gray-700 underline transition-colors"
        >
          PIN oublié ?
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
