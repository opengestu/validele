import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, RefreshCw, Lock, User, Check, Clipboard, ShoppingCart, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { toFrenchErrorMessage } from '@/lib/errors';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
// INSPECT: using supabase client import
import { supabase } from '@/integrations/supabase/client';
// INSPECT: importing otp services
import { sendOTP, verifyOTP as verifyOTPService } from '@/services/otp';
import { apiUrl } from '@/lib/api';
import RoleSpecificFields from './RoleSpecificFields';

import validelLogo from '@/assets/validel-logo.png';
// Ajout: import du composant QRCode
import SimpleQRCode from '@/components/ui/SimpleQRCode';

interface PhoneAuthFormProps {
  initialPhone?: string;
  onBack?: () => void;
  onStepChange?: (step: 'phone' | 'otp' | 'login-pin' | 'pin' | 'confirm-pin' | 'profile') => void;
  className?: string;
  /** Show the "Continuer" CTA in the keypad. Default: false. */
  showContinue?: boolean;
  /** When true and an initialPhone is provided, immediately start the "forgot PIN" flow (send OTP and go to OTP step). */
  startResetPin?: boolean;
}

export const PhoneAuthForm: React.FC<PhoneAuthFormProps> = ({ initialPhone, onBack, onStepChange, className, showContinue = false, startResetPin = false }) => {
  const [step, setStep] = useState<'phone' | 'otp' | 'login-pin' | 'pin' | 'confirm-pin' | 'profile'>('phone');
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false); // Nouvel état pour le spinner de redirection
  const [resendCooldown, setResendCooldown] = useState(0);
  const [formData, setFormData] = useState({
    phone: '',
    otp: '',
    pin: '',
    confirmPin: '',
    fullName: '',
    role: 'buyer' as 'buyer' | 'vendor' | 'delivery',
    companyName: '',
    vehicleInfo: '',
    address: '',
    customAddress: '',
    walletType: 'wave-senegal'
  });
  const [isNewUser, setIsNewUser] = useState(false);
  // Ajouté : pour bloquer l'envoi OTP si profil existe
  const [hasCheckedProfile, setHasCheckedProfile] = useState(false);
  const [isResetPin, setIsResetPin] = useState(false);
  const [existingProfile, setExistingProfile] = useState<{ id: string; full_name: string; role: string; pin_hash: string | null } | null>(null);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '']);
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [confirmPinDigits, setConfirmPinDigits] = useState(['', '', '', '']);
  const [loginPinDigits, setLoginPinDigits] = useState(['', '', '', '']);
  // Store OTP code used for reset so we can re-verify server-side when saving the new PIN
  const [resetOtpCode, setResetOtpCode] = useState('');
 
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
  // Ref pour éviter d'auto-démarrer plusieurs fois
  const autoStartedRef = useRef(false);
  // Préremplir le téléphone si fourni via props (ex: navigation state)
  useEffect(() => {
    if (initialPhone) {
      setFormData(prev => ({ ...prev, phone: initialPhone }));
      // Laisse handleSendOTP décider du flow (OTP ou PIN)
      if (!autoStartedRef.current) {
        autoStartedRef.current = true;
        setTimeout(() => {
          if (startResetPin) handleForgotPin(initialPhone);
          else handleSendOTP(initialPhone);
        }, 120);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPhone]);

  // Démarrer directement le flux "reset PIN" si demandé via props et si un numéro est pré-rempli
  useEffect(() => {
    if (startResetPin && initialPhone && !autoStartedRef.current) {
      autoStartedRef.current = true;
      // small delay to allow initialPhone to settle
      setTimeout(() => {
        // call the forgot handler to send OTP and set reset mode
        handleForgotPin();
      }, 150);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startResetPin, initialPhone]);
  // length du numéro (9 chiffres attendus, sans espaces)
  const phoneLen = formData.phone.replace(/\D/g, '').length;
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

  // Inform parent page of the current step so it can hide/show contextual headers
  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);


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

  // Fonction pour formater le numéro local au format "7X XXX XX XX"
  const formatLocalPhone = (value: string): string => {
    const digits = value.replace(/\D/g, '').slice(0, 9);
    if (digits.length === 0) return '';
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
    if (digits.length <= 7) return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
    return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`;
  };

  // Ajout : gestion centralisée du clavier pour router les touches
  /* keypad helpers removed */

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
  const handleSendOTP = async (phoneOverride?: string) => {
    // Si profil déjà trouvé, ne pas envoyer d'OTP ni relancer la vérification
    if (existingProfile) {
      setStep('login-pin');
      toast({
        title: `Bonjour ${existingProfile.full_name.split(' ')[0]} ! 👋`,
        description: "Entrez votre code PIN pour vous connecter",
      });
      return;
    }
    const phoneToUse = phoneOverride ?? formData.phone;
    if (!phoneToUse) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer votre numéro de téléphone",
        variant: "destructive",
      });
      return;
    }
    const formattedPhone = formatPhoneNumber(phoneToUse);
   
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
      if (!hasCheckedProfile) {
        const digitsOnly = formattedPhone.replace(/\D/g, '');
        const last9 = digitsOnly.slice(-9);
        console.log('Recherche profil: formattedPhone=', formattedPhone, 'last9=', last9);

        // Rechercher le profil via l'endpoint admin backend pour récupérer le flag `hasPin`
        try {
          const existsResp = await fetch(apiUrl(`/auth/users/exists?phone=${encodeURIComponent(formattedPhone)}`));
          if (existsResp.ok) {
            const json = await existsResp.json().catch(() => null);
            if (json && json.exists && json.profile) {
              const p = json.profile as { id: string; full_name?: string; role?: string; hasPin?: boolean; phone?: string };
              // On ne récupère PAS le pin côté client pour des raisons de sécurité.
              setExistingProfile({
                id: p.id,
                full_name: p.full_name || '',
                role: (p.role ?? 'buyer') as 'buyer' | 'vendor' | 'delivery',
                // Utiliser un sentinel pour indiquer qu'un PIN existe côté serveur
                pin_hash: p.hasPin ? '__SERVER__' : null
              });
              setHasCheckedProfile(true);
              setStep('login-pin');
              toast({
                title: `Bonjour ${p.full_name?.split(' ')[0] ?? ''} ! 👋`,
                description: "Entrez votre code PIN pour vous connecter",
              });
              setLoading(false);
              return;
            }
          } else {
            console.error('Erreur vérification existence profil (server):', existsResp.status);
          }
        } catch (err) {
          console.error('Erreur vérification existence profil (catch):', err);
        }
        setHasCheckedProfile(true);
      }
      // Nouvel utilisateur - envoyer OTP pour inscription
      try {
        await sendOTP(formattedPhone);
        toast({
          title: "Code envoyé ! 📱",
          description: "Vérifiez vos SMS pour valider votre numéro",
        });
        setStep('otp');
        startResendCooldown();
        setTimeout(() => otpRefs[0].current?.focus(), 100);
      } catch (err: unknown) {
        type RespProfile = { id: string; full_name?: string; role?: string };
        type ErrWithBody = { status?: number; body?: { code?: string; profile?: RespProfile } };
        const e = err as ErrWithBody;
        // Si le backend renvoie que le profil existe (protection serveur), basculer en mode login-pin
        if (e?.body?.code === 'PROFILE_EXISTS' && e.body.profile) {
          const p = e.body.profile;
          setExistingProfile({ id: p.id, full_name: p.full_name || '', role: (p.role ?? 'buyer') as 'buyer' | 'vendor' | 'delivery', pin_hash: null });
          setHasCheckedProfile(true);
          setStep('login-pin');
          toast({
            title: `Bonjour ${p.full_name?.split(' ')[0] ?? ''} ! 👋`,
            description: "Entrez votre code PIN pour vous connecter",
          });
          setLoading(false);
          return;
        }
        // ré-throw pour traitement générique
        throw err;
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
      // Si on est en mode réinitialisation, NE PAS vérifier l'OTP côté client
      // (la vérification sera faite côté serveur au moment de la sauvegarde du PIN)
      if (isResetPin) {
        setResetOtpCode(otpCode);
        toast({ title: "Identité confirmée ! ✅", description: "Créez votre nouveau code PIN" });
        setStep('pin');
        setPinDigits(['', '', '', '']);
        setTimeout(() => pinRefs[0].current?.focus(), 100);
        return;
      }

      // Vérifier l'OTP via notre backend Direct7Networks (flow normal)
      const result = await verifyOTPService(formData.phone, otpCode);
      if (result.valid) {
        // OTP validé (flow normal)
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
          
          // Activer le mode redirection pour afficher le spinner plein écran
          setRedirecting(true);
          await new Promise(resolve => setTimeout(resolve, 800));
          
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
    if (enteredPin.length !== 4) return;
    if (!existingProfile) {
      toast({ title: "Erreur", description: "Session expirée, recommencez", variant: "destructive" });
      setStep('phone');
      return;
    }
    setLoading(true);
    try {
      const formattedPhone = formatPhoneNumber(formData.phone);
      // Appel direct au backend pour valider le PIN et obtenir un JWT
      const loginResp = await fetch(apiUrl('/auth/login-pin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone, pin: enteredPin })
      });
      const body = await loginResp.json().catch(() => ({}));
      if (!loginResp.ok) {
        throw new Error(body.error || 'Code PIN incorrect');
      }
      // Succès : stocker token et session
      let accessToken = body.token;
      console.log('[DEBUG] /auth/login-pin result body:', body);
      // Si c'est un vendeur, générer le JWT backend pour session SMS
      if (existingProfile.role === 'vendor') {
        try {
          const jwtResp = await fetch('https://validele.onrender.com/api/vendor/generate-jwt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vendor_id: existingProfile.id, phone: formData.phone })
          });
          const jwtData = await jwtResp.json().catch(() => null);
          console.log('[DEBUG] /api/vendor/generate-jwt response:', jwtData);
          if (jwtData && jwtData.success && jwtData.token) {
            accessToken = jwtData.token;
          }
        } catch (e) {
          console.error('Erreur génération JWT vendeur:', e);
        }
      }
      if (accessToken) {
        localStorage.setItem('auth_token', accessToken);
      }
      localStorage.setItem('sms_auth_session', JSON.stringify({
        phone: formData.phone,
        profileId: existingProfile.id,
        role: existingProfile.role,
        fullName: existingProfile.full_name,
        loginTime: new Date().toISOString(),
        access_token: accessToken || undefined
      }));
      console.log('[DEBUG] sms_auth_session stored:', JSON.parse(localStorage.getItem('sms_auth_session') || '{}'));
      toast({
        title: "Connexion réussie ! 🎉",
        description: `Content de vous revoir, ${existingProfile.full_name}`,
      });
      
      // Activer le mode redirection pour afficher le spinner plein écran
      setRedirecting(true);
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const redirectPath = existingProfile.role === 'vendor' ? '/vendor' :
                           existingProfile.role === 'delivery' ? '/delivery' : '/buyer';
      window.location.href = redirectPath;
      return;
    } catch (error: unknown) {
      console.error('Erreur login PIN:', error);
      let errorMessage = "Veuillez réessayer";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "object" && error !== null && "message" in error && typeof (error as { message?: string }).message === "string") {
        errorMessage = (error as { message?: string }).message || errorMessage;
      }
      toast({
        title: "Code PIN incorrect",
        description: errorMessage,
        variant: "destructive",
      });
      setLoginPinDigits(['', '', '', '']);
      loginPinRefs[0].current?.focus();
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
      // Utiliser l'ID du profil existant au lieu de dépendre de la session Supabase
      if (!existingProfile?.id) {
        throw new Error('Profil utilisateur introuvable');
      }
      // Validate PIN locally
      if (!formData.pin || String(formData.pin).length !== 4 || !/^[0-9]{4}$/.test(String(formData.pin))) {
        throw new Error('PIN invalide');
      }

      // Call backend endpoint to securely verify OTP and save hashed PIN
      const body = {
        phone: formData.phone,
        code: resetOtpCode,
        newPin: String(formData.pin)
      };
      const resp = await fetch(apiUrl('/api/auth/reset-pin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        // Si OTP invalide, proposer de renvoyer le code et retourner à l'étape OTP
        if (json?.error && json.error.toLowerCase().includes('otp')) {
          toast({ title: 'Erreur', description: 'OTP invalide ou expiré. Veuillez renvoyer le code et réessayer.', variant: 'destructive' });
          setIsResetPin(true);
          setStep('otp');
          setOtpDigits(['', '', '', '']);
          setTimeout(() => otpRefs[0].current?.focus(), 200);
          return;
        }
        throw new Error(json?.error || 'Impossible de réinitialiser le PIN');
      }

      // Créer la session locale
      localStorage.setItem('sms_auth_session', JSON.stringify({
        phone: formData.phone,
        profileId: existingProfile.id,
        role: existingProfile.role,
        fullName: existingProfile.full_name,
        loginTime: new Date().toISOString()
      }));
      toast({
        title: isResetPin ? "PIN réinitialisé ! 🎉" : "PIN créé ! 🎉",
        description: isResetPin ? "Vous pouvez maintenant vous connecter" : `Bienvenue ${existingProfile.full_name}`,
      });
     
      // Activer le mode redirection pour afficher le spinner plein écran
      setRedirecting(true);
      await new Promise(resolve => setTimeout(resolve, 800));
     
      // Réinitialiser le mode reset
      setIsResetPin(false);
      const redirectPath = existingProfile.role === 'vendor' ? '/vendor' :
                         existingProfile.role === 'delivery' ? '/delivery' : '/buyer';
     
      // Rafraîchir pour charger la session
      window.location.href = redirectPath;
    } catch (error: unknown) {
      console.error('Erreur mise à jour PIN:', error);
      const message = (error instanceof Error) ? error.message : 'Impossible de sauvegarder le PIN';
      toast({
        title: "Erreur",
        description: message,
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
          wallet_type: formData.role === 'vendor' ? formData.walletType : null,
          address: formData.address,
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
      // Créer une session SMS dans localStorage avec le token JWT si présent
      localStorage.setItem('sms_auth_session', JSON.stringify({
        phone: formData.phone,
        profileId: newProfileId,
        role: formData.role,
        fullName: formData.fullName,
        loginTime: new Date().toISOString(),
        access_token: created && typeof created.token === 'string' ? created.token : undefined,
        expiresIn: created?.expiresIn
      }));
      toast({
        title: "Compte créé ! 🎊",
        description: "Bienvenue sur Validèl",
      });
      
      // Activer le mode redirection pour afficher le spinner plein écran
      setRedirecting(true);
      await new Promise(resolve => setTimeout(resolve, 800));
      
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
  const handleForgotPin = async (phoneOverride?: string) => {
    setLoading(true);
    try {
      // Format and set phone if override provided or to ensure correct format
      const rawPhone = phoneOverride || formData.phone;
      const formatted = formatPhoneNumber(rawPhone || '');
      setFormData(prev => ({ ...prev, phone: formatted }));

      // Envoyer un OTP via Direct7 pour vérifier l'identité
      // allowExisting=true permet d'envoyer l'OTP même si le profil existe (cas reset PIN)
      await sendOTP(formatted, { allowExisting: true });
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
          type={hidden ? "password" : "text"}
          inputMode="none"
          readOnly
          pattern="[0-9]*"
          maxLength={1}
          value={digits[index]}
          onChange={(e) => handleDigitInput(index, e.target.value, digits, setDigits, refs, onComplete)}
          onKeyDown={(e) => handleDigitKeyDown(index, e, digits, setDigits, refs)}
          onFocus={(e) => e.currentTarget.blur()}
          onPaste={(e: React.ClipboardEvent<HTMLInputElement>) => {
            const pasted = e.clipboardData?.getData('text')?.replace(/\D/g, '').slice(0, 4);
            if (pasted) {
              const newDigits = [...digits];
              pasted.split('').forEach((d, i) => { if (i < newDigits.length) newDigits[i] = d; });
              setDigits(newDigits);
              if (newDigits.join('').length === refs.length) onComplete?.(newDigits.join(''));
            }
            e.preventDefault();
          }}
          aria-label={`Chiffre ${index + 1}`}
          className="w-16 h-16 text-center text-3xl font-bold md:w-20 md:h-20 md:text-4xl border-2 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all bg-white/95 shadow-md"
          autoComplete="one-time-code"
        />
      ))}
    </div>
  );

  // Helper: add/remove digits via on-screen keypad
  const addDigitToGroup = (
    digit: string,
    digits: string[],
    setDigits: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.RefObject<HTMLInputElement | null>[],
    onComplete?: (code: string) => void
  ) => {
    const idx = digits.findIndex(d => d === '');
    if (idx === -1) return;
    const newDigits = [...digits];
    newDigits[idx] = digit;
    setDigits(newDigits);
    // focus next
    if (idx < refs.length - 1) {
      refs[idx + 1].current?.focus();
    }
    const full = newDigits.join('');
    if (full.length === refs.length && onComplete) onComplete(full);
  };

  const removeLastFromGroup = (
    digits: string[],
    setDigits: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.RefObject<HTMLInputElement | null>[]
  ) => {
    // find last non-empty
    let pos = -1;
    for (let i = digits.length - 1; i >= 0; i--) {
      if (digits[i] !== '') { pos = i; break; }
    }
    if (pos === -1) return;
    const newDigits = [...digits];
    newDigits[pos] = '';
    setDigits(newDigits);
    refs[pos].current?.focus();
  };

  const handleKeypadDigit = (digit: string) => {
    if (step === 'phone') {
      const only = (formData.phone || '').toString().replace(/\D/g, '');
      if (only.length >= 9) return;
      const newDigits = only + digit;
      setFormData(prev => ({ ...prev, phone: newDigits }));
      return;
    }
    if (step === 'otp') return addDigitToGroup(digit, otpDigits, setOtpDigits, otpRefs, handleVerifyOTP);
    if (step === 'login-pin') return addDigitToGroup(digit, loginPinDigits, setLoginPinDigits, loginPinRefs, handleLoginPin);
    if (step === 'pin') return addDigitToGroup(digit, pinDigits, setPinDigits, pinRefs, handleCreatePin);
    if (step === 'confirm-pin') return addDigitToGroup(digit, confirmPinDigits, setConfirmPinDigits, confirmPinRefs, handleConfirmPin);
  };

  const handleKeypadBackspace = () => {
    if (step === 'phone') {
      const only = (formData.phone || '').toString().replace(/\D/g, '');
      const newDigits = only.slice(0, -1);
      setFormData(prev => ({ ...prev, phone: newDigits }));
      return;
    }
    if (step === 'otp') return removeLastFromGroup(otpDigits, setOtpDigits, otpRefs);
    if (step === 'login-pin') return removeLastFromGroup(loginPinDigits, setLoginPinDigits, loginPinRefs);
    if (step === 'pin') return removeLastFromGroup(pinDigits, setPinDigits, pinRefs);
    if (step === 'confirm-pin') return removeLastFromGroup(confirmPinDigits, setConfirmPinDigits, confirmPinRefs);
  };

  // Haptic feedback helper (small vibration on supported devices)
  const provideHaptic = () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof window !== 'undefined' && 'navigator' in window && (navigator as any).vibrate) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigator as any).vibrate(10);
      }
    } catch (e) {
      // ignore if vibrate not supported or throws
    }
  };

  // Detect Android to apply larger bottom offset (nav bar) on some devices
  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  

  const renderNumericKeypad = () => {
    const canContinue = (() => {
      if (step === 'phone') return phoneLen >= 9 && !existingProfile;
      if (step === 'otp') return otpDigits.join('').length === 4;
      if (step === 'login-pin') return loginPinDigits.join('').length === 4;
      if (step === 'pin') return pinDigits.join('').length === 4;
      if (step === 'confirm-pin') return confirmPinDigits.join('').length === 4;
      return false;
    })();

    return (
      <>
        {/* Desktop / tablet keypad (hidden on small screens) */}
        <div className="hidden sm:block mt-8 pb-3 sm:pb-0">
<div className="grid grid-cols-3 gap-5 max-w-[300px] mx-auto">
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <button
                key={n}
                type="button"
                aria-label={`Num ${n}`}
                onPointerDown={provideHaptic}
                onClick={() => handleKeypadDigit(String(n))}
                className="w-[80px] h-[80px] rounded-full bg-white text-2xl font-semibold flex items-center justify-center touch-manipulation active:scale-95 transition-all hover:bg-[#10b981] hover:text-white"
                style={{ border: '3px solid #10b981', color: '#10b981' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#10b981'}
              >{n}</button>
            ))}
            {/* Left cell intentionally left empty to keep 0 and X on the right */}
            <div className="w-[80px] h-[80px]" />
            <button 
              type="button" 
              aria-label="Num 0" 
              onPointerDown={provideHaptic} 
              onClick={() => handleKeypadDigit('0')} 
              className="w-[80px] h-[80px] rounded-full bg-white text-2xl font-semibold flex items-center justify-center transition-all active:scale-95 hover:bg-[#10b981] hover:text-white"
              style={{ border: '3px solid #10b981', color: '#10b981' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#10b981'}
            >0</button>
            <button
              type="button"
              aria-label="Effacer"
              title="Effacer"
              onPointerDown={provideHaptic}
              onClick={handleKeypadBackspace}
              className="w-[80px] h-[80px] rounded-full bg-white text-2xl font-semibold flex items-center justify-center active:scale-95 transition-all hover:bg-red-500 hover:text-white"
              style={{ border: '3px solid #ef4444', color: '#ef4444' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#ef4444'}
            >
              <span className="text-3xl">⌫</span>
            </button>
          </div>

          {showContinue && step === 'phone' && (
            <div className="mt-4">
              <button
                type="button"
                onPointerDown={provideHaptic}
                onClick={() => {
                  if (step === 'phone') handleSendOTP();
                }}
                disabled={!canContinue || loading}
                className="w-full h-12 rounded-2xl bg-[#24BD5C] text-white flex items-center justify-center font-semibold disabled:opacity-60 active:scale-95 transition-transform"
              >
                {loading ? <Spinner size="sm" className="text-white local-spinner" /> : 'Continuer'}
              </button>
            </div>
          )}
        </div>

        {/* Mobile keypad (dans le flux normal, pas fixed) */}
        <div className="sm:hidden mt-8">
          <div className="flex justify-center">
            <div
              className="bg-white/95 p-3 rounded-2xl w-full max-w-[320px]"
            >
              <div className="grid grid-cols-3 gap-5 max-w-[280px] mx-auto">
                {[1,2,3,4,5,6,7,8,9].map(n => (
                  <button
                    key={`m-${n}`}
                    type="button"
                    aria-label={`Num ${n}`}
                    onPointerDown={provideHaptic}
                    onClick={() => handleKeypadDigit(String(n))}
                    className="w-[75px] h-[75px] rounded-full bg-white text-2xl font-semibold flex items-center justify-center touch-manipulation active:scale-95 transition-all"
                    style={{ border: '3px solid #10b981', color: '#10b981' }}
                  >{n}</button>
                ))}
                <div className="w-[75px] h-[75px]" />
                <button 
                  type="button" 
                  aria-label="Num 0" 
                  onPointerDown={provideHaptic} 
                  onClick={() => handleKeypadDigit('0')} 
                  className="w-[75px] h-[75px] rounded-full bg-white text-2xl font-semibold flex items-center justify-center transition-all active:scale-95"
                  style={{ border: '3px solid #10b981', color: '#10b981' }}
                >0</button>
                <button
                  type="button"
                  aria-label="Effacer"
                  title="Effacer"
                  onPointerDown={provideHaptic}
                  onClick={handleKeypadBackspace}
                  className="w-[75px] h-[75px] rounded-full bg-white text-2xl font-semibold flex items-center justify-center active:scale-95 transition-all"
                  style={{ border: '3px solid #ef4444', color: '#ef4444' }}
                >
                  <span className="text-3xl">⌫</span>
                </button>
              </div>

              {showContinue && step === 'phone' && (
                <div className="mt-3 mb-1">
                  <button
                    type="button"
                    onPointerDown={provideHaptic}
                    onClick={() => {
                      if (step === 'phone') handleSendOTP();
                    }}
                    disabled={!canContinue || loading}
                    className="w-full h-12 rounded-2xl bg-[#24BD5C] text-white flex items-center justify-center font-semibold disabled:opacity-60 active:scale-95 transition-transform"
                    style={{ position: 'relative', zIndex: 2 }}
                  >
                    {'Continuer'}
                  </button>
                </div>
              )}
              {/* Bouton PIN oublié visible tout en bas à l'étape login-pin */}
              {step === 'login-pin' && (
                <div className="mt-3 mb-1 flex justify-center">
                  <button
                    type="button"
                    onClick={() => handleForgotPin()}
                    disabled={!formData.phone || loading}
                    className="text-sm text-primary hover:underline px-4 py-2 bg-white rounded-md shadow-sm"
                    style={{ minWidth: 120 }}
                  >
                    PIN oublié ?
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <>
      {/* Spinner overlay plein écran pendant la redirection */}
      {redirecting && (
        <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-white">
          <div className="flex flex-col items-center gap-4">
            <Spinner size="xl" className="text-[#24BD5C]" />
            <p className="text-lg font-medium text-gray-700">Connexion en cours...</p>
          </div>
        </div>
      )}
      
      {/* Spinner overlay pendant le chargement (loading) - moins prioritaire que redirecting */}
      {loading && !redirecting && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/60">
          <Spinner size="xl" hideWhenGlobal={false} />
        </div>
      )}
      {/* Suppression de tout texte 'chargement...' entre code pin et dashboard */}

      <form onSubmit={(e) => e.preventDefault()} className={`min-h-[48vh] flex items-start justify-center px-4 pt-0 transform translate-y-12 md:translate-y-16 pb-8 ${className ?? ''}`}>
      <div className="mx-auto w-full max-w-[320px] sm:max-w-[360px] bg-background/60 backdrop-blur-md p-3 sm:p-4 rounded-2xl border-none space-y-3 sm:pb-4" style={{ boxShadow: 'none', border: 'none' }}>


        {/* Étape : téléphone */}
        {step === 'phone' && (
          <div className="space-y-2">
            <div className="w-full flex justify-center">
              <div className="w-full max-w-[300px]">
                <div className={`flex items-center gap-0 px-2 py-0 rounded-xl border bg-background/50 mb-2 ${phoneLen > 0 && phoneLen < 9 ? 'border-red-300' : 'border-muted/30'} focus-within:ring-2 focus-within:ring-primary/20`}>
                  <div className="flex items-center gap-1 px-2 py-1 shrink-0 border-r border-muted/20">
                    <span className="text-base md:text-lg">🇸🇳</span>
                    <span className="text-base md:text-lg text-muted-foreground font-medium">+221</span>
                  </div>
                  <div className="flex items-center flex-1">
                    <Input
                      id="phone"
                      type="tel"
                      value={formatLocalPhone(formData.phone.replace('+221', '').replace(/^0/, ''))}
                      onChange={(e) => {
                        const rawDigits = e.target.value.replace(/\D/g, '');
                        handleInputChange('phone', rawDigits);
                      }}
                      placeholder="7X XXX XX XX"
                      inputMode="none"
                      readOnly
                      onFocus={(e) => e.target.blur()}
                      onPointerDown={(e) => { provideHaptic(); e.preventDefault(); }}
                      onTouchStart={(e) => { provideHaptic(); e.preventDefault(); }}
                      onPaste={(e: React.ClipboardEvent<HTMLInputElement>) => {
                        const pasted = e.clipboardData?.getData('text')?.replace(/\D/g, '').slice(0, 9);
                        if (pasted) {
                          setFormData(prev => ({ ...prev, phone: pasted }));
                        }
                        e.preventDefault();
                      }}
                      className="flex-1 h-12 text-lg md:h-14 md:text-xl px-3 border-0 bg-transparent placeholder:text-base md:placeholder:text-lg placeholder:text-muted-foreground focus:outline-none cursor-default"
                      maxLength={12}
                    />
                  </div>
                </div>
                <div className="mt-14 sm:mt-10 md:mt-12">{renderNumericKeypad()}</div>
              </div>
            </div>
          </div>
        )}

        {/* Étape OTP */}
        {step === 'otp' && (
          <>
            <div className="text-center mb-3">
              <p className="text-base font-medium">Entrez le code reçu par SMS</p>
              <p className="text-sm text-muted-foreground mt-2">Saisissez le code à 4 chiffres envoyé sur votre téléphone</p>
            </div>
            <div className="mt-6 mb-16 sm:mb-4">
              {renderDigitInputs(otpDigits, setOtpDigits, otpRefs, handleVerifyOTP, false)}
            </div>
            {renderNumericKeypad()}
            <div className="text-center mt-2">
              <div className="flex items-center justify-between text-sm mt-4">
                <button type="button" onClick={handleBack} className="text-muted-foreground hover:text-foreground font-medium">← Modifier</button>
                <button type="button" onClick={handleResendOTP} disabled={resendCooldown > 0} className="flex items-center gap-1 text-primary font-medium hover:underline disabled:text-muted-foreground disabled:no-underline">
                  <RefreshCw className="w-4 h-4" />
                  {resendCooldown > 0 ? `${resendCooldown}s` : 'Renvoyer'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Étape login-pin */}
        {step === 'login-pin' && (
          <>
            <div className="text-center mb-1 md:mb-2">
              <div className="inline-flex items-center justify-center w-14 h-14 md:w-16 md:h-16 bg-primary/10 rounded-full mb-1">
                <Lock className="w-6 h-6 md:w-8 md:h-8 text-primary" />
              </div>
              <h3 className="text-xl sm:text-2xl font-extrabold text-foreground">Bonjour {existingProfile?.full_name?.split(' ')[0]} ! 👋</h3>
              <p className="text-sm text-muted-foreground mt-1">Entrez votre code PIN pour continuer</p>
            </div>
            <div className="mb-16 sm:mb-4">{renderDigitInputs(loginPinDigits, setLoginPinDigits, loginPinRefs, handleLoginPin, true)}</div>
            {renderNumericKeypad()}
            {/* Mobile: bouton PIN oublié déplacé dans le clavier numérique (voir plus haut) */}
            {/* Desktop: bouton normal */}
            <div className="hidden sm:block text-center mt-6">
              <button
                type="button"
                onClick={() => handleForgotPin()}
                disabled={!formData.phone || loading}
                className="text-sm text-primary hover:underline px-4 py-2 bg-white rounded-md shadow-sm"
              >
                PIN oublié ?
              </button>
            </div>
          </>
        )}

        {/* Étape pin */}
        {step === 'pin' && (
          <>
            <div className="text-center mb-2 md:mb-3">
              <h3 className="text-lg sm:text-xl font-extrabold text-foreground">Créez votre code PIN</h3>
              <p className="text-sm text-muted-foreground mt-2">Choisissez 4 chiffres pour sécuriser votre compte</p>
              <p className="text-xs text-blue-600 mt-2">🔒 Ce code vous permettra de vous connecter rapidement lors de vos prochaines visites</p>
            </div>
            <div className="mb-16 sm:mb-4">{renderDigitInputs(pinDigits, setPinDigits, pinRefs, handleCreatePin, true)}</div>
            {renderNumericKeypad()}
            <Button type="button" onClick={handleBack} className="w-full text-sm text-muted-foreground hover:text-foreground mt-6">← Retour</Button>
          </>
        )}

        {/* Étape confirm-pin */}
        {step === 'confirm-pin' && (
          <>
            <div className="text-center mb-4">
              <div className="inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 bg-blue-100 rounded-full mb-3">
                <Lock className="w-8 h-8 md:w-10 md:h-10 text-green-600" />
              </div>
              <h3 className="text-lg sm:text-xl font-extrabold text-foreground">Confirmez votre PIN</h3>
              <p className="text-sm text-muted-foreground mt-1">Entrez à nouveau votre code PIN pour le confirmer</p>
              <p className="text-xs text-orange-600 mt-1">⚠️ Assurez-vous d'entrer le même code que précédemment</p>
            </div>
            <div className="mb-16 sm:mb-4">{renderDigitInputs(confirmPinDigits, setConfirmPinDigits, confirmPinRefs, handleConfirmPin, true)}</div>
            {renderNumericKeypad()}
          </>
        )}

        {/* Étape profile */}
        {step === 'profile' && (
          <div className="space-y-4">
            {/* Header visuel selon le rôle */}
            <div className="flex flex-col items-center mb-2 mt-2">
              {formData.role === 'buyer' && (
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <User className="w-8 h-8 text-primary" />
                </div>
              )}
              {formData.role === 'vendor' && (
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-2">
                  <ShoppingCart className="w-8 h-8 text-green-600" />
                </div>
              )}
              {formData.role === 'delivery' && (
                <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mb-2">
                  <Truck className="w-8 h-8 text-blue-600" />
                </div>
              )}
              <h2 className="text-xl font-extrabold text-foreground">
                {formData.role === 'buyer' && 'Profil Client(e)'}
                {formData.role === 'vendor' && 'Profil Vendeur(se)'}
                {formData.role === 'delivery' && 'Profil Livreur'}
              </h2>
            </div>
            {/* QR Code supprimé à la demande */}
            <div>
              <Input
                value={formData.fullName}
                onChange={(e) => handleInputChange('fullName', e.target.value)}
                placeholder="Votre prénom et nom"
                className="h-12 text-lg rounded-xl border-2 placeholder:text-sm md:placeholder:text-base placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 transition-shadow shadow-sm"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">Vous êtes...</Label>
              <Select value={formData.role} onValueChange={(value) => handleInputChange('role', value)}>
                <SelectTrigger className="h-12 rounded-xl border-2 bg-white shadow-sm flex items-center px-3 text-base font-semibold focus:ring-2 focus:ring-primary/20 transition-all">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-lg border mt-2 bg-white">
                  <SelectItem value="buyer" className="flex items-center gap-2 py-2 px-3 text-base hover:bg-primary/10 rounded-lg cursor-pointer">
                    <User className="h-5 w-5 text-primary" />
                    <span>Client(e)</span>
                  </SelectItem>
                  <SelectItem value="vendor" className="flex items-center gap-2 py-2 px-3 text-base hover:bg-primary/10 rounded-lg cursor-pointer">
                    <ShoppingCart className="h-5 w-5 text-green-600" />
                    <span>Vendeur(se)</span>
                  </SelectItem>
                  <SelectItem value="delivery" className="flex items-center gap-2 py-2 px-3 text-base hover:bg-primary/10 rounded-lg cursor-pointer">
                    <Truck className="h-5 w-5 text-blue-600" />
                    <span>Livreur</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Champs spécifiques selon le rôle */}
            {formData.role === 'delivery' ? (
              <Input
                value={formData.vehicleInfo}
                onChange={(e) => handleInputChange('vehicleInfo', e.target.value)}
                placeholder="Immatriculation du véhicule (obligatoire)"
                className="h-12 rounded-xl border-2 placeholder:text-sm md:placeholder:text-base placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 transition-shadow shadow-sm"
                required
              />
            ) : (
              <>
                <RoleSpecificFields
                  role={formData.role}
                  companyName={formData.companyName}
                  vehicleInfo={formData.vehicleInfo}
                  walletType={formData.walletType}
                  onCompanyNameChange={(value) => handleInputChange('companyName', value)}
                  onVehicleInfoChange={(value) => handleInputChange('vehicleInfo', value)}
                  onWalletTypeChange={(value) => handleInputChange('walletType', value)}
                  disabled={loading}
                  companyNamePlaceholder="Nom de votre boutique/entreprise"
                />
                {/* Adresse: Select Senegal regions/quartiers + Autre */}
                <Label className="text-sm font-medium mb-2 block">Adresse</Label>
                <Select
                  value={formData.address}
                  onValueChange={(value) => handleInputChange('address', value)}
                  required
                >
                  <SelectTrigger className="h-12 rounded-xl border-2 bg-white shadow-sm flex items-center px-3 text-base font-semibold focus:ring-2 focus:ring-primary/20 transition-all">
                    <SelectValue placeholder={formData.role === 'buyer' ? 'Adresse (obligatoire)' : 'Adresse de la boutique (obligatoire)'} />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl shadow-lg border mt-2 bg-white max-h-72 overflow-y-auto">
                    <SelectItem value="Dakar - Plateau">Dakar - Plateau</SelectItem>
                    <SelectItem value="Dakar - Médina">Dakar - Médina</SelectItem>
                    <SelectItem value="Dakar - Parcelles Assainies">Dakar - Parcelles Assainies</SelectItem>
                    <SelectItem value="Dakar - Grand Yoff">Dakar - Grand Yoff</SelectItem>
                    <SelectItem value="Dakar - Yoff">Dakar - Yoff</SelectItem>
                    <SelectItem value="Dakar - Ouakam">Dakar - Ouakam</SelectItem>
                    <SelectItem value="Dakar - Liberté">Dakar - Liberté</SelectItem>
                    <SelectItem value="Dakar - HLM">Dakar - HLM</SelectItem>
                    <SelectItem value="Dakar - Fass">Dakar - Fass</SelectItem>
                    <SelectItem value="Dakar - Grand Dakar">Dakar - Grand Dakar</SelectItem>
                    <SelectItem value="Dakar - Hann Bel Air">Dakar - Hann Bel Air</SelectItem>
                    <SelectItem value="Dakar - Maristes">Dakar - Maristes</SelectItem>
                    <SelectItem value="Dakar - Mermoz">Dakar - Mermoz</SelectItem>
                    <SelectItem value="Dakar - Sacré-Cœur">Dakar - Sacré-Cœur</SelectItem>
                    <SelectItem value="Dakar - Almadies">Dakar - Almadies</SelectItem>
                    <SelectItem value="Dakar - Ngor">Dakar - Ngor</SelectItem>
                    <SelectItem value="Dakar - Patte d'Oie">Dakar - Patte d'Oie</SelectItem>
                    <SelectItem value="Dakar - Dieuppeul">Dakar - Dieuppeul</SelectItem>
                    <SelectItem value="Dakar - Biscuiterie">Dakar - Biscuiterie</SelectItem>
                    <SelectItem value="Guédiawaye - Golf Sud">Guédiawaye - Golf Sud</SelectItem>
                    <SelectItem value="Guédiawaye - Sam Notaire">Guédiawaye - Sam Notaire</SelectItem>
                    <SelectItem value="Guédiawaye - Wakhinane Nimzatt">Guédiawaye - Wakhinane Nimzatt</SelectItem>
                    <SelectItem value="Guédiawaye - Médina Gounass">Guédiawaye - Médina Gounass</SelectItem>
                    <SelectItem value="Guédiawaye - Ndiarème Limamoulaye">Guédiawaye - Ndiarème Limamoulaye</SelectItem>
                    <SelectItem value="Pikine - Pikine Nord">Pikine - Pikine Nord</SelectItem>
                    <SelectItem value="Pikine - Pikine Est">Pikine - Pikine Est</SelectItem>
                    <SelectItem value="Pikine - Pikine Ouest">Pikine - Pikine Ouest</SelectItem>
                    <SelectItem value="Pikine - Thiaroye">Pikine - Thiaroye</SelectItem>
                    <SelectItem value="Pikine - Guinaw Rail">Pikine - Guinaw Rail</SelectItem>
                    <SelectItem value="Pikine - Dalifort">Pikine - Dalifort</SelectItem>
                    <SelectItem value="Rufisque - Rufisque Ville">Rufisque - Rufisque Ville</SelectItem>
                    <SelectItem value="Rufisque - Bargny">Rufisque - Bargny</SelectItem>
                    <SelectItem value="Rufisque - Diamniadio">Rufisque - Diamniadio</SelectItem>
                    <SelectItem value="Thiès - Thiès Ville">Thiès - Thiès Ville</SelectItem>
                    <SelectItem value="Thiès - Tivaouane">Thiès - Tivaouane</SelectItem>
                    <SelectItem value="Thiès - Mbour">Thiès - Mbour</SelectItem>
                    <SelectItem value="Saint-Louis - Saint-Louis Ville">Saint-Louis - Saint-Louis Ville</SelectItem>
                    <SelectItem value="Saint-Louis - Richard Toll">Saint-Louis - Richard Toll</SelectItem>
                    <SelectItem value="Saint-Louis - Dagana">Saint-Louis - Dagana</SelectItem>
                    <SelectItem value="Kaolack - Kaolack Ville">Kaolack - Kaolack Ville</SelectItem>
                    <SelectItem value="Kaolack - Nioro">Kaolack - Nioro</SelectItem>
                    <SelectItem value="Kaolack - Guinguinéo">Kaolack - Guinguinéo</SelectItem>
                    <SelectItem value="Ziguinchor - Ziguinchor Ville">Ziguinchor - Ziguinchor Ville</SelectItem>
                    <SelectItem value="Ziguinchor - Bignona">Ziguinchor - Bignona</SelectItem>
                    <SelectItem value="Ziguinchor - Oussouye">Ziguinchor - Oussouye</SelectItem>
                    <SelectItem value="Diourbel - Diourbel Ville">Diourbel - Diourbel Ville</SelectItem>
                    <SelectItem value="Diourbel - Bambey">Diourbel - Bambey</SelectItem>
                    <SelectItem value="Diourbel - Mbacké">Diourbel - Mbacké</SelectItem>
                    <SelectItem value="Louga - Louga Ville">Louga - Louga Ville</SelectItem>
                    <SelectItem value="Louga - Kébémer">Louga - Kébémer</SelectItem>
                    <SelectItem value="Louga - Linguère">Louga - Linguère</SelectItem>
                    <SelectItem value="Fatick - Fatick Ville">Fatick - Fatick Ville</SelectItem>
                    <SelectItem value="Fatick - Foundiougne">Fatick - Foundiougne</SelectItem>
                    <SelectItem value="Fatick - Gossas">Fatick - Gossas</SelectItem>
                    <SelectItem value="Kaffrine - Kaffrine Ville">Kaffrine - Kaffrine Ville</SelectItem>
                    <SelectItem value="Kaffrine - Koungheul">Kaffrine - Koungheul</SelectItem>
                    <SelectItem value="Kaffrine - Malem Hodar">Kaffrine - Malem Hodar</SelectItem>
                    <SelectItem value="Kédougou - Kédougou Ville">Kédougou - Kédougou Ville</SelectItem>
                    <SelectItem value="Kédougou - Salémata">Kédougou - Salémata</SelectItem>
                    <SelectItem value="Kédougou - Saraya">Kédougou - Saraya</SelectItem>
                    <SelectItem value="Kolda - Kolda Ville">Kolda - Kolda Ville</SelectItem>
                    <SelectItem value="Kolda - Vélingara">Kolda - Vélingara</SelectItem>
                    <SelectItem value="Kolda - Médina Yoro Foulah">Kolda - Médina Yoro Foulah</SelectItem>
                    <SelectItem value="Matam - Matam Ville">Matam - Matam Ville</SelectItem>
                    <SelectItem value="Matam - Kanel">Matam - Kanel</SelectItem>
                    <SelectItem value="Matam - Ranérou">Matam - Ranérou</SelectItem>
                    <SelectItem value="Sédhiou - Sédhiou Ville">Sédhiou - Sédhiou Ville</SelectItem>
                    <SelectItem value="Sédhiou - Bounkiling">Sédhiou - Bounkiling</SelectItem>
                    <SelectItem value="Sédhiou - Goudomp">Sédhiou - Goudomp</SelectItem>
                    <SelectItem value="Tambacounda - Tambacounda Ville">Tambacounda - Tambacounda Ville</SelectItem>
                    <SelectItem value="Tambacounda - Bakel">Tambacounda - Bakel</SelectItem>
                    <SelectItem value="Tambacounda - Goudiry">Tambacounda - Goudiry</SelectItem>
                    <SelectItem value="Tambacounda - Koumpentoum">Tambacounda - Koumpentoum</SelectItem>
                    <SelectItem value="Autre">Autre</SelectItem>
                  </SelectContent>
                </Select>
                {/* Champ texte si "Autre" sélectionné */}
                {formData.address === 'Autre' && (
                  <Input
                    className="mt-2 h-12 rounded-xl border-2 placeholder:text-sm md:placeholder:text-base placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 transition-shadow shadow-sm"
                    placeholder="Entrez votre adresse exacte"
                    value={formData.customAddress || ''}
                    onChange={e => handleInputChange('customAddress', e.target.value)}
                    required
                  />
                )}
              </>
            )}
            <Button
              type="button"
              onClick={handleCompleteProfile}
              className="w-full h-10 text-base rounded-xl"
              disabled={loading || !formData.fullName}
            >
              <div className="flex items-center gap-2">
                <span>Terminer</span>
                <Check className="w-4 h-4 ml-1" />
              </div>
            </Button>
          </div>
        )}
      </div>
      </form>
    </>
  );
};