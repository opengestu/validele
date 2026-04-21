// INSPECT: AuthPage
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { LEGAL_FEATURE_ENABLED, PRIVACY_POLICY_ROUTE, TERMS_OF_USE_ROUTE } from '@/lib/legalConsent';
const validelLogo = '/icons/validel-logo.svg';
import { PhoneAuthForm } from './auth/PhoneAuthForm';

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
    <div className="flex flex-col min-h-screen items-center bg-white pt-0 md:pt-0">
      {authStep === 'phone' && showFirstVisitWelcome && (
        <div className="w-full text-center mt-0 mb-0 pt-0 transform translate-y-6 md:translate-y-10">
          <h2 className="text-2xl md:text-3xl font-extrabold">Bienvenue chez <span className="text-primary font-bold">Validèl</span> !</h2>
          <p className="text-sm md:text-base text-muted-foreground mt-1 mb-0">Entrez votre numéro pour commencer</p>
        </div>
      )}

      <div className="w-full flex items-center justify-center mt-0 mb-2">
        <PhoneAuthForm
          onStepChange={setAuthStep}
          showContinue
          initialPhone={initialPhone}
          startResetPin={startResetPin}
          forcePhoneStep={forcePhoneEntry}
        />
      </div>

      {LEGAL_FEATURE_ENABLED && (
        <div className="mb-6 flex items-center gap-3 text-xs text-muted-foreground">
          <Link to={PRIVACY_POLICY_ROUTE} className="hover:text-foreground underline underline-offset-2">
            Règles de confidentialité
          </Link>
          <span className="h-1 w-1 rounded-full bg-slate-300" />
          <Link to={TERMS_OF_USE_ROUTE} className="hover:text-foreground underline underline-offset-2">
            Conditions d'utilisation
          </Link>
        </div>
      )}
    </div>
  );
};

export default AuthPage;
