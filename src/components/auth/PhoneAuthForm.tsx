import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, ArrowRight, RefreshCw, Lock, User, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toFrenchErrorMessage } from '@/lib/errors';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { sendOTP, verifyOTP as verifyOTPService } from '@/services/otp';
import { apiUrl } from '@/lib/api';

interface PhoneAuthFormProps {
  onSwitchToEmail: () => void;
}

const PhoneAuthForm = ({ onSwitchToEmail }: PhoneAuthFormProps) => {
  const [step, setStep] = useState<'phone' | 'otp' | 'login-pin' | 'pin' | 'confirm-pin' | 'profile'>('phone');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [formData, setFormData] = useState({
    phone: '',
    otp: '',
    pin: '',
    confirmPin: '',
    fullName: '',
    role: 'buyer' as 'buyer' | 'vendor' | 'delivery',
    companyName: '',
    vehicleInfo: ''
  });
  const [isNewUser, setIsNewUser] = useState(false);
  const [isResetPin, setIsResetPin] = useState(false);
  const [existingProfile, setExistingProfile] = useState<{ id: string; full_name: string; role: string; pin_hash: string | null } | null>(null);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '']);
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [confirmPinDigits, setConfirmPinDigits] = useState(['', '', '', '']);
  const [loginPinDigits, setLoginPinDigits] = useState(['', '', '', '']);
  
  // Refs stables pour les inputs
  const otpRef0 = useRef<HTMLInputElement>(null);
  const otpRef1 = useRef<HTMLInputElement>(null);
  const otpRef2 = useRef<HTMLInputElement>(null);
  const otpRef3 = useRef<HTMLInputElement>(null);
  const otpRefs = [otpRef0, otpRef1, otpRef2, otpRef3];
  
  const pinRef0 = useRef<HTMLInputElement>(null);
  const pinRef1 = useRef<HTMLInputElement>(null);
  const pinRef2 = useRef<HTMLInputElement>(null);
  const pinRef3 = useRef<HTMLInputElement>(null);
  const pinRefs = [pinRef0, pinRef1, pinRef2, pinRef3];
  
  const confirmPinRef0 = useRef<HTMLInputElement>(null);
  const confirmPinRef1 = useRef<HTMLInputElement>(null);
  const confirmPinRef2 = useRef<HTMLInputElement>(null);
  const confirmPinRef3 = useRef<HTMLInputElement>(null);
  const confirmPinRefs = [confirmPinRef0, confirmPinRef1, confirmPinRef2, confirmPinRef3];
  
  const loginPinRef0 = useRef<HTMLInputElement>(null);
  const loginPinRef1 = useRef<HTMLInputElement>(null);
  const loginPinRef2 = useRef<HTMLInputElement>(null);
  const loginPinRef3 = useRef<HTMLInputElement>(null);
  const loginPinRefs = [loginPinRef0, loginPinRef1, loginPinRef2, loginPinRef3];
  
  const navigate = useNavigate();
  const { toast } = useToast();
  const { refreshProfile } = useAuth();

  // Auto-focus sur le premier champ OTP quand on arrive à l'étape OTP
  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => otpRef0.current?.focus(), 200);
    } else if (step === 'login-pin') {
      setTimeout(() => loginPinRef0.current?.focus(), 200);
    } else if (step === 'pin') {
      setTimeout(() => pinRef0.current?.focus(), 200);
    } else if (step === 'confirm-pin') {
      setTimeout(() => confirmPinRef0.current?.focus(), 200);
    }
  }, [step]);

  // Format du numéro de téléphone sénégalais
  const formatPhoneNumber = (phone: string): string => {
    let cleaned = phone.replace(/\s/g, '').replace(/-/g, '');
    
    if (cleaned.startsWith('0')) {
      cleaned = '+221' + cleaned.substring(1);
    }
    
    if (!cleaned.startsWith('+')) {
      if (cleaned.startsWith('221')) {
        cleaned = '+' + cleaned;
      } else {
        cleaned = '+221' + cleaned;
      }
    }
    
    return cleaned;
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Gestion des inputs à 4 chiffres (style Wave)
  const handleDigitInput = (
    index: number, 
    value: string, 
    digits: string[], 
    setDigits: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.RefObject<HTMLInputElement | null>[],
    onComplete: (code: string) => void
  ) => {
    if (value.length > 1) {
      // Si l'utilisateur colle un code complet
      const pastedDigits = value.replace(/\D/g, '').slice(0, 4).split('');
      const newDigits = [...digits];
      pastedDigits.forEach((digit, i) => {
        if (i < 4) newDigits[i] = digit;
      });
      setDigits(newDigits);
      if (pastedDigits.length === 4) {
        onComplete(newDigits.join(''));
      }
      return;
    }

    const newDigits = [...digits];
    newDigits[index] = value.replace(/\D/g, '');
    setDigits(newDigits);

    // Passer au champ suivant
    if (value && index < 3) {
      refs[index + 1].current?.focus();
    }

    // Vérifier si le code est complet
    const fullCode = newDigits.join('');
    if (fullCode.length === 4 && !newDigits.includes('')) {
      onComplete(fullCode);
    }
  };

  const handleDigitKeyDown = (
    index: number, 
    e: React.KeyboardEvent,
    digits: string[],
    setDigits: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.RefObject<HTMLInputElement | null>[]
  ) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      refs[index - 1].current?.focus();
      const newDigits = [...digits];
      newDigits[index - 1] = '';
      setDigits(newDigits);
    }
  };

  // Démarrer le cooldown pour le renvoi du code
  const startResendCooldown = () => {
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Envoyer le code OTP (uniquement pour inscription)
  const handleSendOTP = async () => {
    if (!formData.phone) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer votre numéro de téléphone",
        variant: "destructive",
      });
      return;
    }

    const formattedPhone = formatPhoneNumber(formData.phone);
    
    if (!formattedPhone.match(/^\+221[0-9]{9}$/)) {
      toast({
        title: "Numéro invalide",
        description: "Veuillez entrer un numéro sénégalais valide (9 chiffres)",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setFormData(prev => ({ ...prev, phone: formattedPhone }));

    try {
      // Vérifier si une session email existe déjà (conflit potentiel)
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession?.user?.email && !currentSession.user.phone) {
        // L'utilisateur est connecté par email - le déconnecter pour éviter les conflits
        console.log('Session email détectée, déconnexion pour éviter conflits:', currentSession.user.email);
        await supabase.auth.signOut();
      }

      // D'abord vérifier si ce numéro existe déjà dans la base
      const { data: existingProfiles, error: searchError } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('phone', formattedPhone)
        .limit(1);

      if (searchError) {
        console.error('Erreur recherche profil:', searchError);
      }

      console.log('Recherche profil pour:', formattedPhone, 'Résultat:', existingProfiles);

      const existingUser = existingProfiles && existingProfiles.length > 0 ? existingProfiles[0] : null;

      if (existingUser && existingUser.full_name) {
        // Utilisateur existant - récupérer le PIN
        let pinHash: string | null = null;
        try {
          const { data: pinData } = await supabase
            .from('profiles')
            .select('pin_hash')
            .eq('id', existingUser.id)
            .maybeSingle();
          pinHash = (pinData as { pin_hash?: string | null })?.pin_hash || null;
          console.log('PIN hash trouvé:', pinHash ? 'Oui' : 'Non');
        } catch (e) {
          console.log('Colonne pin_hash non disponible:', e);
        }

        if (pinHash) {
          // Utilisateur avec PIN - connexion directe
          setExistingProfile({
            id: existingUser.id,
            full_name: existingUser.full_name,
            role: existingUser.role,
            pin_hash: pinHash
          });
          setStep('login-pin');
          toast({
            title: `Bonjour ${existingUser.full_name.split(' ')[0]} ! 👋`,
            description: "Entrez votre code PIN pour vous connecter",
          });
        } else {
          // Utilisateur existant SANS PIN - doit créer un PIN
          // On envoie un OTP pour vérifier que c'est bien lui, puis création du PIN
          setExistingProfile({
            id: existingUser.id,
            full_name: existingUser.full_name,
            role: existingUser.role,
            pin_hash: null
          });
          
          // Utiliser Direct7Networks pour envoyer l'OTP
          await sendOTP(formattedPhone);

          setIsNewUser(false); // Pas un nouvel utilisateur, juste besoin de créer un PIN
          toast({
            title: "Vérification requise 📱",
            description: "Confirmez votre numéro pour créer votre code PIN",
          });

          setStep('otp');
          startResendCooldown();
          setTimeout(() => otpRefs[0].current?.focus(), 100);
        }
      } else {
        // Nouvel utilisateur - envoyer OTP pour inscription
        // Utiliser Direct7Networks pour envoyer l'OTP
        await sendOTP(formattedPhone);

        toast({
          title: "Code envoyé ! 📱",
          description: "Vérifiez vos SMS pour valider votre numéro",
        });

        setStep('otp');
        startResendCooldown();
        setTimeout(() => otpRefs[0].current?.focus(), 100);
      }
    } catch (error: unknown) {
      console.error('Erreur:', error);
      const errorMessage = toFrenchErrorMessage(error, 'Erreur lors de la vérification');
      toast({
        title: "Erreur",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Vérifier le code OTP (pour inscription OU connexion utilisateur existant)
  const handleVerifyOTP = async (code?: string) => {
    const otpCode = code || otpDigits.join('');
    
    if (otpCode.length !== 4) {
      return;
    }

    setLoading(true);
    try {
      // Vérifier l'OTP via notre backend Direct7Networks
      const result = await verifyOTPService(formData.phone, otpCode);

      if (result.valid) {
        // OTP validé - vérifier si c'est une réinitialisation de PIN
        if (isResetPin) {
          // Mode réinitialisation - créer un nouveau PIN
          toast({
            title: "Identité confirmée ! ✅",
            description: "Créez votre nouveau code PIN",
          });
          setStep('pin');
          setPinDigits(['', '', '', '']);
          setTimeout(() => pinRefs[0].current?.focus(), 100);
          return;
        }
        
        // Vérifier si c'est un utilisateur existant avec PIN (connexion normale)
        if (existingProfile && existingProfile.pin_hash) {
          // OTP validé + profil existant avec PIN - connexion réussie !
          // Pour les utilisateurs SMS : on utilise localStorage pour maintenir la session
          // car ils n'ont pas de compte Supabase Auth (email/password)
          
          // Stocker les infos de session dans localStorage
          localStorage.setItem('sms_auth_session', JSON.stringify({
            phone: formData.phone,
            profileId: existingProfile.id,
            role: existingProfile.role,
            fullName: existingProfile.full_name,
            loginTime: new Date().toISOString()
          }));

          toast({
            title: "Connexion réussie ! 🎉",
            description: `Bienvenue ${existingProfile.full_name}`,
          });

          // Attendre un peu pour que le toast s'affiche
          await new Promise(resolve => setTimeout(resolve, 500));

          const redirectPath = existingProfile.role === 'vendor' ? '/vendor' : 
                             existingProfile.role === 'delivery' ? '/delivery' : '/buyer';
          
          // Rafraîchir pour charger la session
          window.location.href = redirectPath;
          return;
        }
        
        // Sinon, passer à la création du PIN
        setStep('pin');
        
        if (existingProfile && !existingProfile.pin_hash) {
          // Utilisateur existant sans PIN
          toast({
            title: "Numéro confirmé ! ✅",
            description: "Créez maintenant votre code PIN",
          });
        } else {
          // Nouvel utilisateur
          setIsNewUser(true);
          toast({
            title: "Numéro validé ! ✅",
            description: "Créez maintenant votre code PIN",
          });
        }
      }
    } catch (error: unknown) {
      console.error('Erreur vérification OTP:', error);
      toast({
        title: "Code incorrect",
        description: "Vérifiez le code et réessayez",
        variant: "destructive",
      });
      setOtpDigits(['', '', '', '']);
      otpRefs[0].current?.focus();
    } finally {
      setLoading(false);
    }
  };

  // Créer le PIN
  const handleCreatePin = (code?: string) => {
    const pin = code || pinDigits.join('');
    if (pin.length !== 4) return;
    
    setFormData(prev => ({ ...prev, pin }));
    setStep('confirm-pin');
    setTimeout(() => confirmPinRefs[0].current?.focus(), 100);
  };

  // Vérifier le PIN pour la connexion (utilisateurs existants)
  const handleLoginPin = async (code?: string) => {
    const enteredPin = code || loginPinDigits.join('');
    console.log('=== handleLoginPin appelé ===');
    console.log('PIN entré:', enteredPin);
    console.log('Longueur PIN:', enteredPin.length);
    
    if (enteredPin.length !== 4) {
      console.log('PIN incomplet, retour');
      return;
    }

    console.log('existingProfile:', existingProfile);
    console.log('PIN stocké:', existingProfile?.pin_hash);
    console.log('Comparaison:', enteredPin, '===', existingProfile?.pin_hash, '?', enteredPin === existingProfile?.pin_hash);

    if (!existingProfile) {
      toast({
        title: "Erreur",
        description: "Session expirée, veuillez recommencer",
        variant: "destructive",
      });
      setStep('phone');
      return;
    }

    setLoading(true);
    try {
      // Vérifier si le PIN correspond
      if (existingProfile.pin_hash && enteredPin === existingProfile.pin_hash) {
        console.log('PIN CORRECT !');
        // PIN correct - vérifier si on a déjà une session Supabase active
        const { data: { session } } = await supabase.auth.getSession();
        console.log('Session Supabase:', session ? 'Active' : 'Inactive');
        
        if (session) {
          // Session active - rafraîchir le profil et rediriger
          await refreshProfile();
          
          toast({
            title: "Bon retour ! 🎉",
            description: `Content de vous revoir, ${existingProfile.full_name}`,
          });

          const redirectPath = existingProfile.role === 'vendor' ? '/vendor' : 
                             existingProfile.role === 'delivery' ? '/delivery' : '/buyer';
          navigate(redirectPath, { replace: true });
        } else {
          // Pas de session - on doit vérifier via OTP Direct7
          await sendOTP(formData.phone);

          toast({
            title: "PIN correct ! ✅",
            description: "Entrez le code reçu par SMS pour finaliser",
          });

          // Passer à l'étape de vérification OTP pour login
          setStep('otp');
          setOtpDigits(['', '', '', '']);
          startResendCooldown();
          setTimeout(() => otpRefs[0].current?.focus(), 100);
        }
      } else {
        // PIN incorrect
        console.log('PIN INCORRECT !');
        console.log('Attendu:', existingProfile.pin_hash);
        console.log('Reçu:', enteredPin);
        toast({
          title: "Code PIN incorrect",
          description: "Veuillez réessayer",
          variant: "destructive",
        });
        setLoginPinDigits(['', '', '', '']);
        loginPinRefs[0].current?.focus();
      }
    } catch (error) {
      console.error('Erreur dans handleLoginPin:', error);
    } finally {
      setLoading(false);
    }
  };

  // Confirmer le PIN
  const handleConfirmPin = (code?: string) => {
    const confirmPin = code || confirmPinDigits.join('');
    if (confirmPin.length !== 4) return;

    if (confirmPin !== formData.pin) {
      toast({
        title: "Les codes ne correspondent pas",
        description: "Veuillez réessayer",
        variant: "destructive",
      });
      setConfirmPinDigits(['', '', '', '']);
      confirmPinRefs[0].current?.focus();
      return;
    }

    setFormData(prev => ({ ...prev, confirmPin }));
    
    // Si c'est une réinitialisation de PIN ou utilisateur existant sans PIN
    if (isResetPin || (existingProfile && !existingProfile.pin_hash)) {
      handleSavePinForExistingUser();
    } else {
      // Nouvel utilisateur - compléter le profil
      setStep('profile');
    }
  };

  // Sauvegarder le PIN pour un utilisateur existant
  const handleSavePinForExistingUser = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Utilisateur non connecté');
      }

      // Mettre à jour uniquement le PIN (utiliser rpc ou raw query si la colonne n'est pas dans le type)
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ pin_hash: formData.pin } as Record<string, unknown>)
        .eq('id', user.id);

      if (updateError) throw updateError;

      // Rafraîchir le profil dans le contexte d'authentification
      await refreshProfile();

      toast({
        title: isResetPin ? "PIN réinitialisé ! 🎉" : "PIN créé ! 🎉",
        description: isResetPin ? "Vous pouvez maintenant vous connecter" : `Bienvenue ${existingProfile?.full_name}`,
      });
      
      // Réinitialiser le mode reset
      setIsResetPin(false);

      const redirectPath = existingProfile?.role === 'vendor' ? '/vendor' : 
                         existingProfile?.role === 'delivery' ? '/delivery' : '/buyer';
      navigate(redirectPath, { replace: true });

    } catch (error: unknown) {
      console.error('Erreur mise à jour PIN:', error);
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder le PIN",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Compléter le profil
  const handleCompleteProfile = async () => {
    if (!formData.fullName) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer votre nom",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // IMPORTANT: profiles.id est lié à auth.users(id) dans Supabase.
      // Un insert direct avec un UUID aléatoire déclenche une violation FK.
      // On crée donc le user + profile côté backend (service role).
      const response = await fetch(apiUrl('/api/sms/register'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          full_name: formData.fullName,
          phone: formData.phone,
          role: formData.role,
          company_name: formData.companyName,
          vehicle_info: formData.vehicleInfo,
          pin: formData.pin,
        }),
      });

      if (response.status === 404) {
        throw new Error(
          "Backend non à jour : l'endpoint /api/sms/register est introuvable. Mettez à jour / redéployez le backend (Render) puis réessayez."
        );
      }

      const created = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(created?.error || 'Erreur lors de la création du profil');
      }

      const newProfileId = created?.profileId;
      if (!newProfileId) {
        throw new Error('Réponse serveur invalide (profileId manquant)');
      }

      // Créer une session SMS dans localStorage
      localStorage.setItem('sms_auth_session', JSON.stringify({
        phone: formData.phone,
        profileId: newProfileId,
        role: formData.role,
        fullName: formData.fullName,
        loginTime: new Date().toISOString()
      }));

      toast({
        title: "Compte créé ! 🎊",
        description: "Bienvenue sur Validèl",
      });

      const redirectPath = formData.role === 'vendor' ? '/vendor' : 
                         formData.role === 'delivery' ? '/delivery' : '/buyer';
      
      // Utiliser window.location pour forcer le rechargement et détecter la session
      window.location.href = redirectPath;

    } catch (error: unknown) {
      console.error('Erreur création profil:', error);
      const errorMessage = toFrenchErrorMessage(error, 'Erreur lors de la création du profil');
      toast({
        title: "Erreur",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Gérer le PIN oublié
  const handleForgotPin = async () => {
    setLoading(true);
    try {
      // Envoyer un OTP via Direct7 pour vérifier l'identité
      await sendOTP(formData.phone);

      setIsResetPin(true);
      toast({
        title: "Code envoyé ! 📱",
        description: "Entrez le code SMS pour réinitialiser votre PIN",
      });

      setStep('otp');
      setOtpDigits(['', '', '', '']);
      startResendCooldown();
      setTimeout(() => otpRefs[0].current?.focus(), 100);
    } catch (error: unknown) {
      console.error('Erreur envoi OTP:', error);
      const errorMessage = toFrenchErrorMessage(error, "Erreur lors de l'envoi du code");
      toast({
        title: "Erreur",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Renvoyer le code OTP
  const handleResendOTP = async () => {
    if (resendCooldown > 0) return;
    setOtpDigits(['', '', '', '']);
    
    // Si on est en mode reset PIN, ne pas rappeler handleSendOTP complet
    if (isResetPin) {
      await handleForgotPin();
    } else {
      await handleSendOTP();
    }
  };

  // Retourner à l'étape précédente
  const handleBack = () => {
    if (step === 'otp') {
      // Si on est en mode reset PIN, retourner au login-pin
      if (isResetPin) {
        setStep('login-pin');
        setIsResetPin(false);
      } else {
        setStep('phone');
      }
      setOtpDigits(['', '', '', '']);
    } else if (step === 'login-pin') {
      // Retour à l'entrée du numéro
      setStep('phone');
      setLoginPinDigits(['', '', '', '']);
      setExistingProfile(null);
    } else if (step === 'pin') {
      // Si c'est une inscription, retour à OTP, sinon au téléphone
      if (isNewUser) {
        setStep('otp');
      } else {
        setStep('phone');
      }
      setPinDigits(['', '', '', '']);
    } else if (step === 'confirm-pin') {
      setStep('pin');
      setPinDigits(['', '', '', '']);
      setConfirmPinDigits(['', '', '', '']);
    } else if (step === 'profile') {
      setStep('confirm-pin');
    }
  };

  // Fonction pour rendre les 4 champs de saisie
  const renderDigitInputs = (
    digits: string[],
    setDigits: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.RefObject<HTMLInputElement | null>[],
    onComplete: (code: string) => void,
    hidden: boolean = false
  ) => (
    <div className="flex justify-center gap-3">
      {[0, 1, 2, 3].map((index) => (
        <input
          key={index}
          ref={refs[index] as React.RefObject<HTMLInputElement>}
          type={hidden ? "password" : "tel"}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digits[index]}
          onChange={(e) => handleDigitInput(index, e.target.value, digits, setDigits, refs, onComplete)}
          onKeyDown={(e) => handleDigitKeyDown(index, e, digits, setDigits, refs)}
          onFocus={(e) => e.target.select()}
          className="w-14 h-14 text-center text-2xl font-bold border-2 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all bg-background"
          autoComplete="one-time-code"
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Indicateur de progression style Wave */}
      {step !== 'phone' && step !== 'login-pin' && (
        <div className="flex justify-center gap-2 mb-4">
          {['otp', 'pin', 'confirm-pin', 'profile'].map((s, i) => (
            <div
              key={s}
              className={`h-1 w-8 rounded-full transition-all ${
                ['otp', 'pin', 'confirm-pin', 'profile'].indexOf(step) >= i
                  ? 'bg-primary'
                  : 'bg-muted'
              }`}
            />
          ))}
        </div>
      )}

      {/* Étape 1: Numéro de téléphone */}
      {step === 'phone' && (
        <>
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-primary/10 rounded-full mb-4">
              <Phone className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-xl font-bold">Entrez votre numéro</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Nous vous enverrons un code de vérification
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="flex items-center px-4 bg-muted rounded-xl border-2 border-transparent">
                <span className="text-lg font-medium">🇸🇳 +221</span>
              </div>
              <Input
                type="tel"
                value={formData.phone.replace('+221', '').replace(/^0/, '')}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 9);
                  handleInputChange('phone', value);
                }}
                placeholder="77 123 45 67"
                className="flex-1 h-12 text-lg rounded-xl border-2"
                maxLength={12}
              />
            </div>

            <Button 
              onClick={handleSendOTP}
              className="w-full h-12 text-lg rounded-xl"
              disabled={loading || formData.phone.replace(/\D/g, '').length < 9}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Envoi...</span>
                </div>
              ) : (
                <>
                  <span>Continuer</span>
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">ou</span>
            </div>
          </div>

          <Button 
            variant="outline" 
            onClick={onSwitchToEmail}
            className="w-full h-12 rounded-xl"
          >
            Utiliser mon email
          </Button>
        </>
      )}

      {/* Étape 2: Vérification OTP */}
      {step === 'otp' && (
        <>
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
              <Check className="w-10 h-10 text-green-600" />
            </div>
            <h3 className="text-xl font-bold">Vérification</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Code envoyé au<br />
              <span className="font-semibold text-foreground">{formData.phone}</span>
            </p>
          </div>

          {renderDigitInputs(otpDigits, setOtpDigits, otpRefs, handleVerifyOTP, false)}

          {loading && (
            <div className="flex justify-center mt-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          )}

          <div className="flex items-center justify-between text-sm mt-6">
            <button
              type="button"
              onClick={handleBack}
              className="text-muted-foreground hover:text-foreground font-medium"
            >
              ← Modifier
            </button>
            <button
              type="button"
              onClick={handleResendOTP}
              disabled={resendCooldown > 0}
              className="flex items-center gap-1 text-primary font-medium hover:underline disabled:text-muted-foreground disabled:no-underline"
            >
              <RefreshCw className="w-4 h-4" />
              {resendCooldown > 0 ? `${resendCooldown}s` : 'Renvoyer'}
            </button>
          </div>
        </>
      )}

      {/* Étape connexion: Entrer le PIN (utilisateurs existants) */}
      {step === 'login-pin' && (
        <>
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-primary/10 rounded-full mb-4">
              <Lock className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-xl font-bold">Bonjour {existingProfile?.full_name?.split(' ')[0]} ! 👋</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Entrez votre code PIN pour continuer
            </p>
          </div>

          {renderDigitInputs(loginPinDigits, setLoginPinDigits, loginPinRefs, handleLoginPin, true)}

          {loading && (
            <div className="flex justify-center mt-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          )}

          <div className="flex items-center justify-between text-sm mt-6">
            <button
              type="button"
              onClick={handleBack}
              className="text-muted-foreground hover:text-foreground font-medium"
            >
              ← Retour
            </button>
            <button
              type="button"
              onClick={handleForgotPin}
              disabled={loading}
              className="text-primary font-medium hover:underline disabled:opacity-50"
            >
              PIN oublié ?
            </button>
          </div>
        </>
      )}

      {/* Étape 3: Créer le PIN */}
      {step === 'pin' && (
        <>
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 rounded-full mb-4">
              <Lock className="w-10 h-10 text-green-600" />
            </div>
            <h3 className="text-xl font-bold">Créez votre code PIN</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Ce code sécurisera votre compte
            </p>
          </div>

          {renderDigitInputs(pinDigits, setPinDigits, pinRefs, handleCreatePin, true)}

          <button
            type="button"
            onClick={handleBack}
            className="w-full text-sm text-muted-foreground hover:text-foreground mt-6"
          >
            ← Retour
          </button>
        </>
      )}

      {/* Étape 4: Confirmer le PIN */}
      {step === 'confirm-pin' && (
        <>
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 rounded-full mb-4">
              <Lock className="w-10 h-10 text-green-600" />
            </div>
            <h3 className="text-xl font-bold">Confirmez votre PIN</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Entrez à nouveau votre code PIN
            </p>
          </div>

          {renderDigitInputs(confirmPinDigits, setConfirmPinDigits, confirmPinRefs, handleConfirmPin, true)}

          <button
            type="button"
            onClick={handleBack}
            className="w-full text-sm text-muted-foreground hover:text-foreground mt-6"
          >
            ← Retour
          </button>
        </>
      )}

      {/* Étape 5: Compléter le profil */}
      {step === 'profile' && (
        <>
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-purple-100 rounded-full mb-4">
              <User className="w-10 h-10 text-green-600" />
            </div>
            <h3 className="text-xl font-bold">Dernière étape !</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Comment devons-nous vous appeler ?
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <Input
                value={formData.fullName}
                onChange={(e) => handleInputChange('fullName', e.target.value)}
                placeholder="Votre prénom et nom"
                className="h-12 text-lg rounded-xl border-2"
                autoFocus
              />
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Vous êtes...</Label>
              <Select value={formData.role} onValueChange={(value) => handleInputChange('role', value)}>
                <SelectTrigger className="h-12 rounded-xl border-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buyer">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">🛒</span>
                      <span>Client</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="vendor">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">🏪</span>
                      <span>Vendeur</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="delivery">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">🚚</span>
                      <span>Livreur</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.role === 'vendor' && (
              <Input
                value={formData.companyName}
                onChange={(e) => handleInputChange('companyName', e.target.value)}
                placeholder="Nom de votre boutique (optionnel)"
                className="h-12 rounded-xl border-2"
              />
            )}

            {formData.role === 'delivery' && (
              <Input
                value={formData.vehicleInfo}
                onChange={(e) => handleInputChange('vehicleInfo', e.target.value)}
                placeholder="Type de véhicule (optionnel)"
                className="h-12 rounded-xl border-2"
              />
            )}

            <Button 
              onClick={handleCompleteProfile}
              className="w-full h-12 text-lg rounded-xl"
              disabled={loading || !formData.fullName}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Création...</span>
                </div>
              ) : (
                <>
                  <span>Terminer</span>
                  <Check className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </div>

          <button
            type="button"
            onClick={handleBack}
            className="w-full text-sm text-muted-foreground hover:text-foreground mt-4"
          >
            ← Retour
          </button>
        </>
      )}
    </div>
  );
};

export default PhoneAuthForm;
