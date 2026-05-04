// INSPECT: AuthPage
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuth } from '@/hooks/useAuth';
import { LEGAL_FEATURE_ENABLED, PRIVACY_POLICY_ROUTE, TERMS_OF_USE_ROUTE } from '@/lib/legalConsent';
import { PhoneAuthForm } from './auth/PhoneAuthForm';
import { Spinner } from '@/components/ui/spinner';

const AUTH_PHONE_WELCOME_SEEN_KEY = 'auth_phone_welcome_seen_v1';

const AuthPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = React.useMemo(() => new URLSearchParams(location.search), [location.search]);
  const { user, userProfile, loading: authLoading } = useAuth();
  const initialPhone = searchParams.get('phone') || undefined;
  const startResetPin = searchParams.get('resetPin') === '1';
  const forcePhoneEntry = searchParams.get('entry') === 'phone' || searchParams.get('switchAccount') === '1';

  const [authStep, setAuthStep] = React.useState<'phone' | 'otp' | 'login-pin' | 'pin' | 'confirm-pin' | 'profile'>('phone');
  const [showFirstVisitWelcome, setShowFirstVisitWelcome] = React.useState(false);
  const [showOverlay, setShowOverlay] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const alreadySeen = localStorage.getItem(AUTH_PHONE_WELCOME_SEEN_KEY) === '1';
      setShowFirstVisitWelcome(!alreadySeen);
      if (!alreadySeen) {
        localStorage.setItem(AUTH_PHONE_WELCOME_SEEN_KEY, '1');
      }
    } catch {
      // Si localStorage est indisponible, on garde l'entête visible.
      setShowFirstVisitWelcome(true);
    }
  }, []);

  React.useEffect(() => {
    if (authLoading) return;
    if (forcePhoneEntry) return;
    if (!user) return;
    
    // Ne rediriger que si l'utilisateur a un profil COMPLET
    if (!userProfile || !userProfile.full_name) {
      // L'utilisateur est connecté mais n'a pas complété son profil
      // Ne pas rediriger, le laisser sur la page d'authentification
      console.log('Utilisateur connecté mais profil incomplet');
      return;
    }

    const redirectPath = userProfile.role === 'vendor' ? '/vendor' : 
                         userProfile.role === 'delivery' ? '/delivery' : '/buyer';
    navigate(redirectPath, { replace: true });
  }, [authLoading, forcePhoneEntry, navigate, user, userProfile]);


  // UI inspirée de Wave pour la saisie du numéro

  const [phone, setPhone] = React.useState('');

  const handleNext = () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 9 && digits.startsWith('7')) {
      // Aller vers PhoneForm pour suivre le processus de création / vérification
      navigate('/phone', { state: { phone: digits } });
    } else {
      // numéro invalide — ne pas avancer
      // TODO: afficher feedback utilisateur
      console.warn('Numéro invalide');
    }
  };
  // Format d'affichage 7X XXX XX XX

  return (
    <>
      {/* Portal-based overlay as modal with margins */}
      {showOverlay && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 px-6">
          <Spinner size="sm" />
        </div>,
        document.body
      )}

      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-100 px-4 py-6">

        <div className="relative z-10 w-full max-w-[360px]">
          {authStep === 'phone' && showFirstVisitWelcome && (
            <div className="mb-4 text-center text-slate-900">
              <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">Bienvenue chez <span className="text-slate-900">Validèl</span> !</h2>
              <p className="mt-2 text-sm text-slate-600 md:text-base">Entrez votre numéro pour commencer</p>
            </div>
          )}

          <div className="w-full rounded-[28px] bg-white p-5 shadow-none ring-1 ring-slate-200/70">
            <PhoneAuthForm
              onStepChange={setAuthStep}
              showContinue
              initialPhone={initialPhone}
              startResetPin={startResetPin}
              forcePhoneStep={forcePhoneEntry}
              onOverlayChange={setShowOverlay}
            />
          </div>

          {LEGAL_FEATURE_ENABLED && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-500">
              <Link to={PRIVACY_POLICY_ROUTE} className="underline underline-offset-2 hover:text-slate-900">
                Règles de confidentialité
              </Link>
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              <Link to={TERMS_OF_USE_ROUTE} className="underline underline-offset-2 hover:text-slate-900">
                Conditions d'utilisation
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AuthPage;
