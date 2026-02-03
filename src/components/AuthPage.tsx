// INSPECT: AuthPage
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import validelLogo from '@/assets/validel-logo.png';
import { PhoneAuthForm } from './auth/PhoneAuthForm';

const AuthPage = () => {
  const navigate = useNavigate();
  const { user, userProfile, loading: authLoading } = useAuth();

  const [authStep, setAuthStep] = React.useState<'phone' | 'otp' | 'login-pin' | 'pin' | 'confirm-pin' | 'profile'>('phone');

  React.useEffect(() => {
    if (authLoading) return;
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
  }, [authLoading, navigate, user, userProfile]);

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
      {authStep === 'phone' && (
        <div className="w-full text-center mt-0 mb-0 pt-0 transform translate-y-12 md:translate-y-20">
          <h2 className="text-2xl md:text-3xl font-extrabold">Bienvenue chez <span className="text-[#24BD5C] font-bold">Validèl</span> !</h2>
          <p className="text-sm md:text-base text-muted-foreground mt-1 mb-0">Entrez votre numéro pour commencer</p>
        </div>
      )}

      <div className="w-full flex items-center justify-center mt-0 mb-2">
        <PhoneAuthForm onStepChange={setAuthStep} showContinue />
      </div>
    </div>
  );
};

export default AuthPage;
