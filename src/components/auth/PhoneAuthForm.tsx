import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, RefreshCw, Lock, User, Check, Clipboard, ShoppingCart, Truck, ChevronDown, Delete } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { toFrenchErrorMessage } from '@/lib/errors';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
// INSPECT: using supabase client import
import { supabase } from '@/integrations/supabase/client';
// INSPECT: importing otp services
import { sendOTP, verifyOTP as verifyOTPService, type OTPSendResponse } from '@/services/otp';
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
  /** When true, force display of the phone entry step and ignore any restored auth progress. */
  forcePhoneStep?: boolean;
  /** Callback to control overlay visibility from parent component. */
  onOverlayChange?: (show: boolean) => void;
}

type UserRole = 'buyer' | 'vendor' | 'delivery';
type SelectableRole = UserRole | '__role_unselected__';

const ROLE_UNSELECTED: SelectableRole = '__role_unselected__';
const ADDRESS_UNSELECTED = '__address_unselected__';
const TRANSPORT_UNSELECTED = '__transport_unselected__';
const AUTH_RETURN_PATH_KEY = 'auth_return_path';
const SHARED_PRODUCT_PENDING_CODE_KEY = 'pending_shared_product_code';

type PersistedAuthState = {
  step: 'phone' | 'otp' | 'login-pin' | 'pin' | 'confirm-pin' | 'profile';
  phone: string;
  isResetPin: boolean;
  existingProfile: {
    id: string;
    full_name: string;
    role: UserRole;
    pin_hash: boolean;
  } | null;
  updated: number;
};

type LoginPinBody = {
  token?: string;
  error?: string;
  retry_after_seconds?: number | string;
};

type OTPSendResponseWithDebug = OTPSendResponse & {
  code?: string | number;
  otp?: string | number;
  debug_code?: string | number;
  debugOtp?: string | number;
};

const toOtpChannel = (channel?: OTPSendResponse['channel']): 'sms' | 'whatsapp' =>
  channel === 'whatsapp' ? 'whatsapp' : 'sms';

const getOtpDebugCode = (resp: OTPSendResponse): string | null => {
  const payload = resp as OTPSendResponseWithDebug;
  const maybeCode = payload.code ?? payload.otp ?? payload.debug_code ?? payload.debugOtp ?? null;
  const code = maybeCode == null ? null : String(maybeCode);
  return code && /^\d{4}$/.test(code) ? code : null;
};

export const PhoneAuthForm: React.FC<PhoneAuthFormProps> = ({ initialPhone, onBack, onStepChange, className, showContinue = false, startResetPin = false, forcePhoneStep = false, onOverlayChange }) => {
  const FORGOT_PIN_CLICKS_KEY = 'pin_forgot_clicks_v1';
  const MAX_FORGOT_PIN_CLICKS = 1;
  const [step, setStep] = useState<'phone' | 'otp' | 'login-pin' | 'pin' | 'confirm-pin' | 'profile'>('phone');
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false); // Nouvel état pour le spinner de redirection
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpChannel, setOtpChannel] = useState<'sms' | 'whatsapp'>('sms');
  const [formData, setFormData] = useState({
    phone: '',
    otp: '',
    pin: '',
    confirmPin: '',
    fullName: '',
    role: ROLE_UNSELECTED as SelectableRole,
    companyName: '',
    vehicleInfo: '',
    address: ADDRESS_UNSELECTED,
    customAddress: '',
    walletType: 'wave-senegal'
  });
  const [isNewUser, setIsNewUser] = useState(false);
  // Ajouté : pour bloquer l'envoi OTP si profil existe
  const [hasCheckedProfile, setHasCheckedProfile] = useState(false);
  const [isResetPin, setIsResetPin] = useState(false);
  // State: which role simulator is currently activating (prevents double-clicks)
  const [simulatingRole, setSimulatingRole] = useState<'buyer' | 'vendor' | 'delivery' | null>(null);
  // Mobile fallback: dialog for role selection (avoids native select overlay on some devices)
  const [roleSheetOpen, setRoleSheetOpen] = useState(false);
  const [existingProfile, setExistingProfile] = useState<{ id: string; full_name: string; role: 'buyer' | 'vendor' | 'delivery'; pin_hash: string | null } | null>(null);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '']);
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [confirmPinDigits, setConfirmPinDigits] = useState(['', '', '', '']);
  const [loginPinDigits, setLoginPinDigits] = useState(['', '', '', '']);
  const [pinLockoutDetected, setPinLockoutDetected] = useState(false);
  const [forgotPinClicks, setForgotPinClicks] = useState(0);
  const [pinUiState, setPinUiState] = useState<'idle' | 'error' | 'success'>('idle');
  const [phoneProgress, setPhoneProgress] = useState(0);
  // Store OTP code used for reset so we can re-verify server-side when saving the new PIN
  const [resetOtpCode, setResetOtpCode] = useState('');

  const consumePostLoginRedirectPath = (role: 'buyer' | 'vendor' | 'delivery') => {
    if (role !== 'buyer') return role === 'vendor' ? '/vendor' : '/delivery';

    const rawReturnPath = localStorage.getItem(AUTH_RETURN_PATH_KEY);
    if (rawReturnPath) {
      localStorage.removeItem(AUTH_RETURN_PATH_KEY);
      const safe = String(rawReturnPath || '').trim();
      if (safe.startsWith('/buyer')) {
        return safe;
      }
    }

    const pendingCode = String(localStorage.getItem(SHARED_PRODUCT_PENDING_CODE_KEY) || '').trim();
    if (pendingCode) {
      return `/buyer?productCode=${encodeURIComponent(pendingCode)}`;
    }

    return '/buyer';
  };
 
  // Refs stables pour les inputs
  const otpRef0 = useRef<HTMLInputElement>(null);
  const otpRef1 = useRef<HTMLInputElement>(null);
  const otpRef2 = useRef<HTMLInputElement>(null);
  const otpRef3 = useRef<HTMLInputElement>(null);
  const otpRefs = [otpRef0, otpRef1, otpRef2, otpRef3];

  // Local storage key used to persist the in-progress auth state so the flow
  // can be resumed if the app reloads / is backgrounded on mobile.
  const STORAGE_KEY = 'phone_auth_state_v1';

  const isValidRole = (role: string): role is UserRole => role === 'buyer' || role === 'vendor' || role === 'delivery';
  const getRoleLabel = (role: SelectableRole) => {
    if (role === 'buyer') return 'Client(e)';
    if (role === 'vendor') return 'Vendeur(se)';
    if (role === 'delivery') return 'Livreur';
    return 'Non sélectionné';
  };

  const normalizePhoneForKey = useCallback((rawPhone?: string | null) => String(rawPhone || '').replace(/\D/g, ''), []);
  const readForgotPinClicks = useCallback((rawPhone?: string | null) => {
    const phoneKey = normalizePhoneForKey(rawPhone);
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
  }, [normalizePhoneForKey, FORGOT_PIN_CLICKS_KEY]);

  const saveForgotPinClicks = (rawPhone: string | null | undefined, value: number) => {
    const phoneKey = normalizePhoneForKey(rawPhone);
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

  // To avoid hammering clipboard reads on some mobile browsers, remember last attempt.
  const lastClipboardAttemptRef = useRef<number>(0);

  // Hidden ref used to receive iOS/Android SMS autofill (autocomplete="one-time-code").
  const otpAutoFillRef = useRef<HTMLInputElement | null>(null);
  const handleVerifyOtpRef = useRef<(code?: string) => void>(() => {});
  // Flag to avoid clobbering paste handling with onChange events (some browsers fire both).
  const isPastingRef = useRef<boolean>(false);
 
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
        handleForgotPin(undefined, false);
      }, 150);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startResetPin, initialPhone]);

  useEffect(() => {
    if (step !== 'login-pin') {
      setPinLockoutDetected(false);
    }
  }, [step]);

  useEffect(() => {
    const phoneSource = existingProfile ? formData.phone : null;
    setForgotPinClicks(readForgotPinClicks(phoneSource));
  }, [existingProfile, formData.phone, readForgotPinClicks]);
  // Clear stale existingProfile if somehow we're on the phone step with a leftover profile
  // (e.g. localStorage restored existingProfile without restoring step to login-pin)
  useEffect(() => {
    if (step === 'phone' && existingProfile) {
      setExistingProfile(null);
    }
  }, [step, existingProfile]);

  // length du numéro (9 chiffres attendus, sans espaces)
  const phoneLen = formData.phone.replace(/\D/g, '').length;
  
  // Update progress bar when phone length changes
  useEffect(() => {
    const progress = Math.min((phoneLen / 9) * 100, 100);
    setPhoneProgress(progress);
  }, [phoneLen]);

  // Sync loading/redirecting state with parent overlay
  useEffect(() => {
    if (onOverlayChange) {
      onOverlayChange(loading || redirecting);
    }
  }, [loading, redirecting, onOverlayChange]);
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

  // Paste handling is done per-input (onPaste) and via the hidden autofill input
  // (autocomplete="one-time-code") to avoid duplicate handlers and race conditions.

  // Handle autofill from SMS (QuickType) by monitoring a hidden input with autocomplete="one-time-code".
  useEffect(() => {
    if (!otpAutoFillRef.current) return;
    const el = otpAutoFillRef.current;
    const onInput = () => {
      try {
        const text = (el.value || '').replace(/\D/g, '').slice(0, 4);
        if (text.length > 0) {
          const newDigits = ['', '', '', ''];
          text.split('').forEach((d, i) => { if (i < 4) newDigits[i] = d; });
          setOtpDigits(newDigits);
          if (text.length === 4) {
            // small delay to let UI update
            setTimeout(() => handleVerifyOtpRef.current(text), 80);
          }
        }
      } catch (e) {
        // ignore
      } finally {
        // clear the hidden input so next SMS autofill will fire again
        try { el.value = ''; } catch {
          // ignore
        }
      }
    };
    el.addEventListener('input', onInput);
    return () => el.removeEventListener('input', onInput);
  }, []);

  // On mount: attempt to restore minimal state (phone + step) so the flow does not
  // lose progress if the app reloads while backgrounded on mobile. We avoid
  // reusing sensitive data (PIN/OTP) automatically.
  useEffect(() => {
    if (forcePhoneStep) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
      setStep('phone');
      setIsResetPin(false);
      setExistingProfile(null);
      setHasCheckedProfile(false);
      setOtpDigits(['', '', '', '']);
      setPinDigits(['', '', '', '']);
      setConfirmPinDigits(['', '', '', '']);
      setLoginPinDigits(['', '', '', '']);
      setFormData(prev => ({
        ...prev,
        phone: '',
        otp: '',
        pin: '',
        confirmPin: '',
      }));
      return;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s?.phone) {
          setFormData(prev => ({ ...prev, phone: s.phone }));
        }
        if (s?.existingProfile) {
          setExistingProfile({
            id: s.existingProfile.id,
            full_name: s.existingProfile.full_name || '',
            role: s.existingProfile.role || 'buyer',
            pin_hash: s.existingProfile.pin_hash ? '__SERVER__' : null
          });
          setHasCheckedProfile(true);
        }
        if (s?.step && ['phone','otp','login-pin','pin','confirm-pin','profile'].includes(s.step)) {
          setStep(s.step);
        }
        if (s?.isResetPin) setIsResetPin(true);
      }
    } catch (e) {
      // ignore
    }
  }, [forcePhoneStep]);

  // Persist minimal state on important changes so the user can resume the flow
  // if the OS kills the app while backgrounded.
  useEffect(() => {
    try {
      const s: PersistedAuthState = {
        step,
        phone: formData.phone,
        isResetPin,
        existingProfile: existingProfile ? { id: existingProfile.id, full_name: existingProfile.full_name, role: existingProfile.role, pin_hash: !!existingProfile.pin_hash } : null,
        updated: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch (e) {
      // ignore
    }
  }, [step, formData.phone, isResetPin, existingProfile]);

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

  // Dev-only test numbers (accept multiple test numbers; match on last 9 digits)
  const DEV_TEST_LAST9S = ['777693020', '777603020'];
  const DEFAULT_DEV_TEST_LAST9 = DEV_TEST_LAST9S[0];
  const DEFAULT_DEV_TEST_PHONE = `+221${DEFAULT_DEV_TEST_LAST9}`;
  const isDevTestNumber = (raw?: string | null) => DEV_TEST_LAST9S.includes(String(raw || '').replace(/\D/g, '').slice(-9));
  const importMetaEnv = typeof import.meta !== 'undefined'
    ? (import.meta as { env?: { DEV?: boolean } }).env
    : undefined;
  const isDevEnv = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') || Boolean(importMetaEnv?.DEV);
  const normalizeToLast9 = (raw: string) => (raw || '').replace(/\D/g, '').slice(-9);

  const simulateDevSession = async (role: 'buyer' | 'vendor' | 'delivery') => {
    // Allow simulation when running in dev OR when the entered phone is a configured test number
    if (!isDevEnv && !isDevTestNumber(formData.phone)) return;
    // prevent double clicks
    if (simulatingRole) return;
    setSimulatingRole(role);
    try {
      const phoneNorm = formatPhoneNumber(formData.phone || DEFAULT_DEV_TEST_PHONE);
      const profileId = `dev-${role}-${normalizeToLast9(phoneNorm)}`;
      const session: {
        phone: string;
        profileId: string;
        role: 'buyer' | 'vendor' | 'delivery';
        fullName: string;
        loginTime: string;
        access_token?: string;
      } = {
        phone: phoneNorm,
        profileId,
        role,
        fullName: `${role.charAt(0).toUpperCase() + role.slice(1)} (test)`,
        loginTime: new Date().toISOString(),
        access_token: role === 'vendor' ? 'dev-token-vendor' : undefined
      };
      localStorage.setItem('sms_auth_session', JSON.stringify(session));
      if (role === 'vendor') localStorage.setItem('auth_token', 'dev-token-vendor');

      // small delay so UI shows spinner/disabled state, then navigate (use replace + fallback)
      await new Promise((r) => setTimeout(r, 60));
      const path = role === 'vendor' ? '/vendor' : role === 'delivery' ? '/delivery' : '/buyer';
      try { window.location.replace(path); } catch (e) { window.location.href = path; }
      // fallback in case initial navigation doesn't trigger in some environments
      setTimeout(() => { try { if (window.location.pathname !== path) window.location.href = path; } catch (e) { /* ignore */ } }, 350);
    } catch (err) {
      console.error('simulateDevSession error', err);
      setSimulatingRole(null);
    }
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
  const handleDigitInput = async (
    index: number,
    value: string,
    digits: string[],
    setDigits: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.RefObject<HTMLInputElement | null>[],
    onComplete: (code: string) => void
  ) => {
    // If a paste is already being handled, ignore the single-char onChange events
    // that some browsers fire as part of the paste. The paste handler will set all digits.
    if (isPastingRef.current) return;

    if (value.length > 1) {
      // Si l'utilisateur colle plusieurs chiffres dans un champ, insérer à partir de l'index courant
      const pastedDigits = value.replace(/\D/g, '').slice(0, digits.length).split('');
      const newDigits = [...digits];
      pastedDigits.forEach((digit, i) => {
        if (index + i < newDigits.length) newDigits[index + i] = digit;
      });
      setDigits(newDigits);
      // si tous les champs sont remplis, déclencher la validation
      if (!newDigits.includes('')) {
        onComplete(newDigits.join(''));
      } else {
        // sinon, focus sur le premier champ vide
        const firstEmpty = newDigits.findIndex(d => d === '');
        if (firstEmpty !== -1) refs[firstEmpty].current?.focus();
      }
      return;
    }
    const newDigits = [...digits];
    newDigits[index] = value.replace(/\D/g, '');
    setDigits(newDigits);

    // Heuristic: on some mobile browsers the paste only inserts the first character
    // into the focused single-char input. Try reading the clipboard as a fallback
    // and fill remaining digits when clipboard contains more than 1 digit.
    if (value.length === 1 && typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      const now = Date.now();
      if (now - lastClipboardAttemptRef.current > 1000) {
        lastClipboardAttemptRef.current = now;
        isPastingRef.current = true;
        try {
          const clip = await navigator.clipboard.readText();
          // Only read remaining slots starting at current index
          const clipDigits = String(clip || '').replace(/\D/g, '').slice(0, digits.length - index);
          if (clipDigits.length > 0) {
            const filled = [...newDigits];
            clipDigits.split('').forEach((d, i) => {
              if (index + i < filled.length) filled[index + i] = d;
            });
            setDigits(filled);
            if (!filled.includes('')) {
              onComplete(filled.join(''));
              return;
            } else {
              const firstEmpty = filled.findIndex(d => d === '');
              if (firstEmpty !== -1) refs[firstEmpty].current?.focus();
            }
          }
        } catch (err) {
          // ignore clipboard read errors
        } finally {
          setTimeout(() => { isPastingRef.current = false; }, 200);
        }
      }
    }

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
      // D'abord vérifier si ce numéro existe déjà dans la base (sauf pour les flows de reset PIN)
      if (!isResetPin) {
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
        const resp = await sendOTP(formattedPhone);
        const respChannel = toOtpChannel(resp.channel);
        setOtpChannel(respChannel);
        // Notify the user in the usual way
        toast({
          title: respChannel === 'whatsapp' ? "Code envoyé sur WhatsApp ! 💬" : "Code envoyé ! 📱",
          description: respChannel === 'whatsapp'
            ? "Vérifiez vos messages WhatsApp pour le code"
            : "Vérifiez vos SMS pour valider votre numéro",
        });

        // If the backend returned the OTP (useful in development/test or debug endpoints), auto-fill it
        const codeStr = getOtpDebugCode(resp);
        if (codeStr) {
          // Fill the inputs and proceed to OTP step
          setOtpDigits(codeStr.split(''));
          setStep('otp');
          startResendCooldown();
          // Focus then auto-verify (unless we're in a reset PIN flow where verification is handled server-side later)
          setTimeout(() => {
            otpRefs[0].current?.focus();
            if (!isResetPin) {
              // little delay to let UI update
              setTimeout(() => handleVerifyOTP(codeStr), 350);
            } else {
              // store the code for reset flows
              setResetOtpCode(codeStr);
            }
          }, 100);
        } else {
          // Normal flow when OTP is only sent via SMS
          setStep('otp');
          startResendCooldown();
          setTimeout(() => otpRefs[0].current?.focus(), 100);
        }
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
          // Un profil déjà protégé par PIN doit toujours passer par /auth/login-pin
          // pour recevoir un JWT valide et permettre le heartbeat.
          setStep('login-pin');
          setLoginPinDigits(['', '', '', '']);
          toast({
            title: "Numéro confirmé ! ✅",
            description: "Entrez votre code PIN pour vous connecter",
          });
          setTimeout(() => loginPinRefs[0].current?.focus(), 100);
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

  handleVerifyOtpRef.current = handleVerifyOTP;

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
      const body: LoginPinBody = await loginResp.json().catch(() => ({} as LoginPinBody));
      if (!loginResp.ok) {
        const retryAfterSeconds = Number.parseInt(String(body.retry_after_seconds ?? ''), 10);
        const backendError = typeof body.error === 'string' ? String(body.error) : '';
        const isPinLockout =
          loginResp.status === 429
          || (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0)
          || /trop\s+de\s+tentatives/i.test(backendError);
        setPinLockoutDetected(isPinLockout);
        throw new Error(body.error || 'Code PIN incorrect');
      }
      setPinLockoutDetected(false);
      setPinUiState('success');
      await new Promise(resolve => setTimeout(resolve, 600));
      // Succès : stocker token et session
      let accessToken = body.token;
      console.log('[DEBUG] /auth/login-pin result body:', body);
      // Si c'est un vendeur, générer le JWT backend pour session SMS
      if (existingProfile.role === 'vendor') {
        try {
          const jwtResp = await fetch(apiUrl('/api/vendor/generate-jwt'), {
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
      if (!accessToken) {
        throw new Error('Connexion impossible (token manquant). Reessayez.');
      }
      localStorage.setItem('auth_token', accessToken);
      localStorage.setItem('sms_auth_session', JSON.stringify({
        phone: formData.phone,
        profileId: existingProfile.id,
        role: existingProfile.role,
        fullName: existingProfile.full_name,
        loginTime: new Date().toISOString(),
        access_token: accessToken
      }));
      console.log('[DEBUG] sms_auth_session stored:', JSON.parse(localStorage.getItem('sms_auth_session') || '{}'));
      toast({
        title: "Connexion réussie ! 🎉",
        description: `Content de vous revoir, ${existingProfile.full_name}`,
      });
      
      // Activer le mode redirection pour afficher le spinner plein écran
      // Clear persisted interim state so the flow does not resume afterward
      try { localStorage.removeItem(STORAGE_KEY); } catch {
        // ignore
      }
      setRedirecting(true);
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const redirectPath = consumePostLoginRedirectPath(existingProfile.role);
     
      // Utiliser window.location pour forcer le rechargement et détecter la session
      window.location.href = redirectPath;
      return;
    } catch (error: unknown) {
      console.error('Erreur login PIN:', error);
      setPinUiState('error');
      setLoginPinDigits(['', '', '', '']);
      setTimeout(() => { setPinUiState('idle'); loginPinRefs[0].current?.focus(); }, 1200);
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
      setFormData(prev => ({
        ...prev,
        role: ROLE_UNSELECTED,
        address: ADDRESS_UNSELECTED,
        customAddress: '',
      }));
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

      let accessToken = typeof json?.token === 'string' ? json.token : '';
      if (!accessToken) {
        const formattedPhone = formatPhoneNumber(formData.phone);
        const loginResp = await fetch(apiUrl('/auth/login-pin'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: formattedPhone, pin: String(formData.pin) })
        });
        const loginJson = await loginResp.json().catch(() => ({}));
        if (loginResp.ok && typeof loginJson?.token === 'string') {
          accessToken = loginJson.token;
        }
      }

      if (!accessToken) {
        throw new Error('PIN reinitialise mais session invalide (token manquant). Reconnectez-vous.');
      }

      localStorage.setItem('auth_token', accessToken);

      // Créer la session locale
      localStorage.setItem('sms_auth_session', JSON.stringify({
        phone: formData.phone,
        profileId: existingProfile.id,
        role: existingProfile.role,
        fullName: existingProfile.full_name,
        loginTime: new Date().toISOString(),
        access_token: accessToken
      }));
      toast({
        title: isResetPin ? "PIN réinitialisé ! 🎉" : "PIN créé ! 🎉",
        description: isResetPin ? "Vous pouvez maintenant vous connecter" : `Bienvenue ${existingProfile.full_name}`,
      });
     
      // Activer le mode redirection pour afficher le spinner plein écran
      // Clear persisted interim state so the flow does not resume afterward
      try { localStorage.removeItem(STORAGE_KEY); } catch {
        // ignore
      }
      setRedirecting(true);
      await new Promise(resolve => setTimeout(resolve, 800));
     
      // Réinitialiser le mode reset
      setIsResetPin(false);
      const redirectPath = consumePostLoginRedirectPath(existingProfile.role);
     
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
    if (!isValidRole(formData.role)) {
      toast({
        title: 'Erreur',
        description: 'Veuillez choisir votre rôle: Client(e), Vendeur(se) ou Livreur.',
        variant: 'destructive',
      });
      return;
    }

    const selectedRole = formData.role;
    const fullNameTrimmed = formData.fullName.trim();
    const fullNameParts = fullNameTrimmed.split(/\s+/).filter(Boolean);
    if (!fullNameTrimmed) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer votre nom",
        variant: "destructive",
      });
      return;
    }
    if (fullNameParts.length < 2) {
      toast({
        title: "Erreur",
        description: "Veuillez saisir votre prénom et nom (au moins 2 mots)",
        variant: "destructive",
      });
      return;
    }
    if (selectedRole === 'delivery' && formData.vehicleInfo.trim().length === 0) {
      toast({
        title: 'Erreur',
        description: 'Veuillez renseigner votre moyen de transport.',
        variant: 'destructive',
      });
      return;
    }

    if ((selectedRole === 'buyer' || selectedRole === 'vendor') && formData.address === ADDRESS_UNSELECTED) {
      toast({
        title: 'Erreur',
        description: 'Veuillez sélectionner une adresse.',
        variant: 'destructive',
      });
      return;
    }

    if ((selectedRole === 'buyer' || selectedRole === 'vendor') && formData.address === 'Autre' && formData.customAddress.trim().length === 0) {
      toast({
        title: 'Erreur',
        description: 'Veuillez saisir votre adresse exacte.',
        variant: 'destructive',
      });
      return;
    }

    const selectedAddress = formData.address === 'Autre'
      ? formData.customAddress.trim()
      : (formData.address === ADDRESS_UNSELECTED ? '' : formData.address);

    setLoading(true);
    try {
      // Correction : normalisation stricte du wallet_type pour l'inscription
      let walletTypeToSend = formData.walletType;
      if (selectedRole === 'vendor') {
        if (walletTypeToSend === 'orange-money' || walletTypeToSend === 'orange-money-senegal') {
          walletTypeToSend = 'orange-senegal';
        }
        if (walletTypeToSend === 'wave-money' || walletTypeToSend === 'wave-money-senegal') {
          walletTypeToSend = 'wave-senegal';
        }
      }
      const response = await fetch(apiUrl('/api/sms/register'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          full_name: fullNameTrimmed,
          phone: formData.phone,
          role: selectedRole,
          company_name: formData.companyName,
          vehicle_info: formData.vehicleInfo,
          wallet_type: selectedRole === 'vendor' ? walletTypeToSend : null,
          address: selectedAddress,
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
      let accessToken = created && typeof created.token === 'string' ? created.token : '';
      if (!accessToken) {
        const formattedPhone = formatPhoneNumber(formData.phone);
        const loginResp = await fetch(apiUrl('/auth/login-pin'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: formattedPhone, pin: String(formData.pin) })
        });
        const loginJson = await loginResp.json().catch(() => ({}));
        if (loginResp.ok && typeof loginJson?.token === 'string') {
          accessToken = loginJson.token;
        }
      }
      if (!accessToken) {
        throw new Error('Inscription reussie mais session invalide (token manquant). Veuillez vous reconnecter.');
      }

      localStorage.setItem('auth_token', accessToken);

      // Créer une session SMS dans localStorage avec le token JWT si présent
      localStorage.setItem('sms_auth_session', JSON.stringify({
        phone: formData.phone,
        profileId: newProfileId,
        role: selectedRole,
        fullName: formData.fullName,
        loginTime: new Date().toISOString(),
        access_token: accessToken,
        expiresIn: created?.expiresIn
      }));
      toast({
        title: "Compte créé ! 🎊",
        description: "Bienvenue sur Validèl",
      });
      
      // Activer le mode redirection pour afficher le spinner plein écran
      // Clear persisted interim state so the flow does not resume afterward
      try { localStorage.removeItem(STORAGE_KEY); } catch {
        // ignore
      }
      setRedirecting(true);
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const redirectPath = consumePostLoginRedirectPath(selectedRole);
     
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
  const handleForgotPin = async (phoneOverride?: string, enforceLimit = true) => {
    if (enforceLimit) {
      const currentPhone = phoneOverride || formData.phone;
      const currentClicks = readForgotPinClicks(currentPhone);
      if (currentClicks >= MAX_FORGOT_PIN_CLICKS) {
        toast({
          title: 'Support requis',
          description: 'Vous avez deja utilise la reinitialisation PIN. Veuillez appeler le support.',
          variant: 'destructive',
        });
        return;
      }
      const nextClicks = currentClicks + 1;
      saveForgotPinClicks(currentPhone, nextClicks);
      setForgotPinClicks(nextClicks);
    }

    setLoading(true);
    try {
      // Format and set phone if override provided or to ensure correct format
      const rawPhone = phoneOverride || formData.phone;
      const formatted = formatPhoneNumber(rawPhone || '');
      setFormData(prev => ({ ...prev, phone: formatted }));

      // Envoyer un OTP via Direct7 pour vérifier l'identité
      // allowExisting=true permet d'envoyer l'OTP même si le profil existe (cas reset PIN)
      const resp = await sendOTP(formatted, { allowExisting: true });
      const resetChannel = toOtpChannel(resp.channel);
      setOtpChannel(resetChannel);
      setIsResetPin(true);
      toast({
        title: resetChannel === 'whatsapp' ? "Code envoyé sur WhatsApp ! 💬" : "Code envoyé ! 📱",
        description: resetChannel === 'whatsapp'
          ? "Vérifiez WhatsApp pour le code de réinitialisation"
          : "Entrez le code SMS pour réinitialiser votre PIN",
      });

      // If the backend returned the code, auto-fill and move to 'pin' step (reset flows verify server-side later)
      const codeStr = getOtpDebugCode(resp);
      if (codeStr) {
        setOtpDigits(codeStr.split(''));
        setResetOtpCode(codeStr);
        startResendCooldown();
        // For reset flow we jump to enter new PIN directly
        setTimeout(() => {
          setStep('pin');
          setPinDigits(['', '', '', '']);
          setTimeout(() => pinRefs[0].current?.focus(), 100);
        }, 120);
      } else {
        setStep('otp');
        setOtpDigits(['', '', '', '']);
        startResendCooldown();
        setTimeout(() => otpRefs[0].current?.focus(), 100);
      }
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
      toast({
        title: 'Support requis',
        description: 'Pour limiter les SMS, un seul envoi est autorise. Veuillez appeler le support.',
        variant: 'destructive',
      });
      return;
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
    <div className="flex justify-center gap-3 sm:gap-4">
      {[0, 1, 2, 3].map((index) => (
        <input
          key={index}
          ref={refs[index] as React.RefObject<HTMLInputElement>}
          type={hidden ? "password" : "text"}
          inputMode="none"
          readOnly={step !== 'otp'}
          pattern="[0-9]*"
          maxLength={1}
          value={digits[index]}
          onChange={(e) => handleDigitInput(index, e.target.value, digits, setDigits, refs, onComplete)}
          onKeyDown={(e) => handleDigitKeyDown(index, e, digits, setDigits, refs)}
          onFocus={(e) => { if (step !== 'otp') e.currentTarget.blur(); }}
          onPaste={async (e: React.ClipboardEvent<HTMLInputElement>) => {
            e.preventDefault();
            e.stopPropagation();
            // Signal that we are handling a paste so onChange handlers ignore single-char writes
            isPastingRef.current = true;
            setTimeout(() => { isPastingRef.current = false; }, 200);

            // Récupère le texte collé, avec fallback à l'API Clipboard si nécessaire
            let text = e.clipboardData?.getData('text') ?? '';
            if (!text && navigator.clipboard && navigator.clipboard.readText) {
              try { text = await navigator.clipboard.readText(); } catch {
                // ignore
              }
            }
            // Limit pasted to remaining slots (from index)
            const remaining = digits.length - index;
            const pasted = text.replace(/\D/g, '').slice(0, remaining);
            if (pasted) {
              const newDigits = [...digits];
              // Insère les chiffres à partir de l'index courant
              pasted.split('').forEach((d, i) => { if (index + i < newDigits.length) newDigits[index + i] = d; });
              setDigits(newDigits);
              // Clear hidden autofill input if present to avoid double-firing
              try {
                if (otpAutoFillRef.current) otpAutoFillRef.current.value = '';
              } catch {
                // ignore
              }
              if (!newDigits.includes('')) {
                onComplete?.(newDigits.join(''));
              } else {
                const firstEmpty = newDigits.findIndex(d => d === '');
                if (firstEmpty !== -1) refs[firstEmpty].current?.focus();
              }
            }
          }}
          aria-label={`Chiffre ${index + 1}`}
          className="h-16 w-16 rounded-[22px] border border-white/80 bg-white text-center text-3xl font-bold text-slate-900 shadow-none outline-none transition-all focus:border-sky-500 focus:ring-4 focus:ring-sky-100 md:h-20 md:w-20 md:text-4xl"
        />
      ))}
    </div>
  );

  // Fonction pour rendre les slots PIN (divs muets avec points pour login-pin)
  const renderPinSlots = (digits: string[], state: 'idle' | 'error' | 'success') => (
    <div className="flex justify-center gap-3">
      {[0,1,2,3].map(i => (
        <div key={i} style={{
          width: 64, height: 72,
          borderRadius: 16,
          border: `1.5px solid ${
            state === 'error' ? '#E24B4A' :
            state === 'success' ? '#1D9E75' :
            i < digits.filter(Boolean).length ? '#111827' : 'var(--color-border-tertiary)'
          }`,
          background: state === 'error' ? '#FCEBEB' : state === 'success' ? '#E1F5EE' : 'var(--color-background-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
          animation: state === 'error' ? 'shake 0.35s ease' : undefined,
        }}>
          {i < digits.filter(Boolean).length && (
            <div style={{ width: 10, height: 10, borderRadius: '50%',
              background: state === 'error' ? '#E24B4A' : state === 'success' ? '#1D9E75' : '#111827'
            }} />
          )}
        </div>
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
      // Clear stale existingProfile when the user is typing a new number
      if (existingProfile) setExistingProfile(null);
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

  // Haptic feedback intentionally disabled: Android back/navigation should stay silent.
  const provideHaptic = () => {
    // no-op
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

    const btnSize = 'w-full h-[54px] sm:h-[60px]';
    
    const keypadLayout = [
      { num: '1', letters: '' },
      { num: '2', letters: 'ABC' },
      { num: '3', letters: 'DEF' },
      { num: '4', letters: 'GHI' },
      { num: '5', letters: 'JKL' },
      { num: '6', letters: 'MNO' },
      { num: '7', letters: 'PQRS' },
      { num: '8', letters: 'TUV' },
      { num: '9', letters: 'WXYZ' },
      { num: '', letters: '' },
      { num: '0', letters: '' },
      { num: 'backspace', letters: '' },
    ];

    return (
      <div className="mt-12 sm:mt-14 w-full px-0">
          <div className="grid w-full grid-cols-3 gap-8">
            {keypadLayout.map((key, index) => (
              key.num === '' ? (
                <div key={index} className={btnSize} />
              ) : key.num === 'backspace' ? (
                <button
                  key={index}
                  type="button"
                  aria-label="Effacer"
                  title="Effacer"
                  onPointerDown={provideHaptic}
                  onClick={handleKeypadBackspace}
                  onFocus={(e) => (e.currentTarget as HTMLButtonElement).blur()}
                  className={`${btnSize} rounded-[14px] bg-slate-200 text-slate-700 shadow-none transition-colors hover:bg-slate-300 active:scale-[0.98] focus:outline-none flex items-center justify-center touch-manipulation`}
                >
                  <Delete className="h-6 w-6" strokeWidth={2.25} />
                </button>
              ) : (
                <button
                  key={index}
                  type="button"
                  aria-label={`Num ${key.num}`}
                  onPointerDown={provideHaptic}
                  onClick={() => handleKeypadDigit(key.num)}
                  onFocus={(e) => (e.currentTarget as HTMLButtonElement).blur()}
                  className={`${btnSize} rounded-[14px] bg-white shadow-none transition-colors hover:bg-slate-50 active:scale-[0.98] focus:outline-none flex flex-col items-center justify-center touch-manipulation`}
                >
                  <span className="text-[29px] font-bold text-slate-950 leading-none">{key.num}</span>
                  {key.letters && <span className="mt-0.5 text-[9px] font-semibold leading-none text-slate-500">{key.letters}</span>}
                </button>
              )
            ))}
          </div>

          {/* Continuer button */}
          {showContinue && step === 'phone' && (
            <button
              type="button"
              onPointerDown={provideHaptic}
              onClick={() => { if (step === 'phone') handleSendOTP(); }}
              disabled={!canContinue || loading}
              className={`mt-4 w-full h-[48px] rounded-[14px] flex items-center justify-center font-semibold text-[16px] transition-all duration-200 group ${canContinue ? 'bg-slate-950 text-white border border-slate-950 active:scale-[0.99]' : 'bg-slate-200 text-slate-400 border border-slate-200'} shadow-none disabled:opacity-80`}
            >
              Continuer <ArrowRight className={`ml-2 h-4 w-4 transition-transform duration-200 ${canContinue ? 'group-hover:translate-x-0.5' : ''}`} />
            </button>
          )}

          {/* PIN oublié + Changer de compte — côte à côte */}
          {step === 'login-pin' && (
            <div className="flex gap-[14px] justify-center items-center mt-3 mb-2">
              <button
                type="button"
                onClick={() => handleForgotPin()}
                disabled={!formData.phone || loading || forgotPinClicks >= MAX_FORGOT_PIN_CLICKS}
                className="text-[13px] font-medium text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-40"
              >
                PIN oublié ?
              </button>
              <span className="text-gray-300 text-sm">|</span>
              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setFormData(prev => ({ ...prev, phone: '', otp: '', pin: '', confirmPin: '' }));
                  setExistingProfile(null);
                }}
                disabled={loading}
                className="text-[13px] leading-none whitespace-nowrap font-medium hover:underline transition-opacity disabled:opacity-40 text-gray-900 bg-transparent"
              >
                Changer de compte
              </button>
            </div>
          )}
      </div>
    );
  };

  return (
    <>
      {/* Suppression de tout texte 'chargement...' entre code pin et dashboard */}

      <form onSubmit={(e) => e.preventDefault()} className={`w-full flex items-start justify-center px-0 pt-0 pb-0 ${className ?? ''}`}>
      <div className="mx-auto w-full max-w-none space-y-4 p-0 shadow-none backdrop-blur-0">


        {/* Étape : téléphone */}
        {step === 'phone' && (
          <div className="space-y-3">
            {/* App icon with verification badge */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[24px] bg-white shadow-none ring-1 ring-slate-200">
                  <img src={validelLogo} alt="Validel" className="h-full w-full object-cover" />
                </div>
                <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-emerald-500 shadow-none">
                  <Check className="h-4 w-4 text-white" strokeWidth={3} />
                </div>
              </div>
            </div>
            <div className="w-full">
              <div className={`mb-2 flex w-full items-center overflow-hidden rounded-[20px] border bg-slate-950 shadow-none transition-colors ${phoneLen > 0 && phoneLen < 9 ? 'border-rose-400' : 'border-slate-900'} focus-within:border-slate-700`}>
                  <div className="flex h-12 shrink-0 select-none items-center gap-1 border-r border-white/10 bg-white/10 px-2.5">
                    <span className="text-xs font-bold text-slate-300">SN</span>
                    <span className="text-[13px] font-bold text-white">+221</span>
                    <ChevronDown className="mt-0.5 h-3 w-3 text-slate-400" strokeWidth={2.5} />
                  </div>
                  <div className="flex min-w-0 flex-1 items-center">
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
                      className="h-12 min-w-0 flex-1 cursor-default border-0 bg-transparent px-2.5 text-[17px] font-semibold tracking-[0.08em] text-white shadow-none placeholder:text-[15px] placeholder:font-medium placeholder:tracking-[0.08em] placeholder:text-slate-500 focus:outline-none focus-visible:ring-0"
                      maxLength={12}
                    />
                  </div>
                </div>
                
                {/* Progress bar under phone input */}
                <div className="h-1 overflow-hidden rounded-full bg-slate-200">
                  <div 
                    className="h-full rounded-full bg-sky-500 transition-all duration-300 ease-out"
                    style={{ width: `${phoneProgress}%` }}
                  />
                </div>

                {/* Quick simulator for the provided test number (dev or explicit test numbers) */}
                {isDevTestNumber(formData.phone) && (
                  <div className="mt-3 mb-2 p-3 rounded-lg border border-muted/20 bg-slate-50 text-sm">
                    <div className="mb-2 text-xs text-primary font-semibold">Numéro de test détecté</div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => simulateDevSession('buyer')} disabled={!!simulatingRole} className={`flex-1 py-2 rounded-lg ${simulatingRole === 'buyer' ? 'bg-black/90' : 'bg-black'} text-white border-black hover:brightness-95 flex items-center justify-center gap-2`}>
                        {simulatingRole === 'buyer' ? (<><Spinner size="sm" className="text-white" /> Ouverture...</>) : 'Simuler Client'}
                      </button>
                      <button type="button" onClick={() => simulateDevSession('vendor')} disabled={!!simulatingRole} className={`flex-1 py-2 rounded-lg ${simulatingRole === 'vendor' ? 'bg-emerald-700' : 'bg-emerald-600'} text-white hover:brightness-95 flex items-center justify-center gap-2`}>
                        {simulatingRole === 'vendor' ? (<><Spinner size="sm" className="text-white" /> Ouverture...</>) : 'Simuler Vendeur'}
                      </button>
                      <button type="button" onClick={() => simulateDevSession('delivery')} disabled={!!simulatingRole} className={`flex-1 py-2 rounded-lg ${simulatingRole === 'delivery' ? 'bg-sky-700' : 'bg-sky-600'} text-white hover:brightness-95 flex items-center justify-center gap-2`}>
                        {simulatingRole === 'delivery' ? (<><Spinner size="sm" className="text-white" /> Ouverture...</>) : 'Simuler Livreur'}
                      </button>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">Disponible uniquement en mode test (local).</div>
                  </div>
                )}

                <div className="mt-5">{renderNumericKeypad()}</div>
            </div>
          </div>
        )}

        {/* Étape OTP */}
        {step === 'otp' && (
          <>
            <div className="text-center mb-3">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[24px] border border-white/70 bg-white/95 shadow-none">
                <Lock className="h-7 w-7 text-sky-600" />
              </div>
              <p className="text-base font-semibold text-slate-900">
                {otpChannel === 'whatsapp' ? 'Entrez le code reçu par WhatsApp' : 'Entrez le code reçu par SMS'}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                {otpChannel === 'whatsapp'
                  ? 'Saisissez le code à 4 chiffres envoyé sur WhatsApp'
                  : 'Saisissez le code à 4 chiffres envoyé sur votre téléphone'}
              </p>
            </div>
            {/* Hidden input to receive SMS autofill (autocomplete="one-time-code") */}
            <input
              ref={otpAutoFillRef as React.RefObject<HTMLInputElement>}
              type="text"
              inputMode="none"
              autoComplete="one-time-code"
              aria-label="Code OTP automatique"
              title="Code OTP automatique"
              placeholder="Code OTP"
              aria-hidden
              tabIndex={-1}
              className="absolute -left-[9999px] w-px h-px opacity-0"
            />
                <div className="mt-6 mb-8 sm:mb-4">
              {renderDigitInputs(otpDigits, setOtpDigits, otpRefs, handleVerifyOTP, false)}
            </div>

            <div className="mt-8 sm:mt-6">
              {renderNumericKeypad()}
            </div>

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
              {(() => {
                const initials = (existingProfile?.full_name || 'U')
                  .split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
                return (
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: '#E6F1FB', color: '#0C447C',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, fontWeight: 500, margin: '0 auto 12px auto'
                  }}>{initials}</div>
                );
              })()}
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900">Bonjour {existingProfile?.full_name?.split(' ')[0]} ! 👋</h3>
              <p className="text-sm text-muted-foreground mt-1">Entrez votre code PIN pour continuer</p>
            </div>
            <div className="mb-8 sm:mb-4">{renderPinSlots(loginPinDigits, pinUiState)}</div>
            {renderNumericKeypad()}
            {/* Mobile: bouton PIN oublié déplacé dans le clavier numérique (voir plus haut) */}
            {/* Desktop: bouton normal */}
            <div className="hidden sm:flex justify-center gap-3 mt-6">
              <button
                type="button"
                onClick={() => handleForgotPin()}
                disabled={!formData.phone || loading || forgotPinClicks >= MAX_FORGOT_PIN_CLICKS}
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors px-4 py-2 bg-white rounded-md disabled:opacity-40"
              >
                PIN oublié ?
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setFormData(prev => ({ ...prev, phone: '', otp: '', pin: '', confirmPin: '' }));
                  setExistingProfile(null);
                }}
                disabled={loading}
                className="text-sm text-primary hover:underline px-4 py-2 bg-white rounded-md"
              >
                Changer de compte
              </button>
            </div>
          </>
        )}

        {/* Étape pin */}
        {step === 'pin' && (
          <>
            <div className="text-center mb-2 md:mb-3">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[24px] border border-slate-200 bg-white shadow-none">
                <Lock className="h-7 w-7 text-sky-600" />
              </div>
              <h3 className="text-lg sm:text-xl font-extrabold text-slate-900">Créez votre code PIN</h3>
              <p className="text-sm text-muted-foreground mt-2">Choisissez 4 chiffres pour sécuriser votre compte</p>
              <p className="text-xs text-blue-600 mt-2">🔒 Ce code vous permettra de vous connecter rapidement lors de vos prochaines visites</p>
            </div>
            <div className="mb-8 sm:mb-4">{renderDigitInputs(pinDigits, setPinDigits, pinRefs, handleCreatePin, true)}</div>
            {renderNumericKeypad()}
            <Button type="button" onClick={handleBack} className="w-full text-sm text-muted-foreground hover:text-foreground mt-6">← Retour</Button>
          </>
        )}

        {/* Étape confirm-pin */}
        {step === 'confirm-pin' && (
          <>
            <div className="text-center mb-4">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-[24px] border border-slate-200 bg-white shadow-none mb-3">
                <Lock className="w-7 h-7 text-sky-600" />
              </div>
              <h3 className="text-lg sm:text-xl font-extrabold text-slate-900">Confirmez votre PIN</h3>
              <p className="text-sm text-muted-foreground mt-1">Entrez à nouveau votre code PIN pour le confirmer</p>
              <p className="text-xs text-orange-600 mt-1">⚠️ Assurez-vous d'entrer le même code que précédemment</p>
            </div>
            <div className="mb-8 sm:mb-4">{renderDigitInputs(confirmPinDigits, setConfirmPinDigits, confirmPinRefs, handleConfirmPin, true)}</div>
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
              {!isValidRole(formData.role) && (
                <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-2">
                  <User className="w-8 h-8 text-gray-500" />
                </div>
              )}
              <h2 className="text-xl font-extrabold text-foreground">
                Profil utilisateur
              </h2>
            </div>
            {/* QR Code supprimé à la demande */}
            <div>
              <Input
                value={formData.fullName}
                onChange={(e) => handleInputChange('fullName', e.target.value)}
                placeholder="Votre prénom et nom"
                className="h-12 text-lg rounded-xl border-2 placeholder:text-sm md:placeholder:text-base placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 transition-shadow shadow-none"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">Choisissez votre rôle</Label>
              {/* Mobile fallback: show a dialog sheet on small viewports to avoid native overlay issues */}
              {typeof window !== 'undefined' && window.innerWidth <= 640 ? (
                <>
                  <Button
                    onClick={() => setRoleSheetOpen(true)}
                    className="h-12 rounded-xl border-2 bg-white shadow-none flex items-center px-3 text-base font-semibold justify-between w-full"
                    aria-haspopup="dialog"
                    aria-expanded={roleSheetOpen}
                    aria-label={`Choix du rôle. Rôle actuel: ${getRoleLabel(formData.role)}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {formData.role === 'buyer' && <User className="h-5 w-5 text-primary" />}
                      {formData.role === 'vendor' && <ShoppingCart className="h-5 w-5 text-primary" />}
                      {formData.role === 'delivery' && <Truck className="h-5 w-5 text-primary" />}
                      {!isValidRole(formData.role) && <User className="h-5 w-5 text-gray-500" />}
                      <span className="text-base font-semibold truncate min-w-0 ml-1 text-primary">
                        Rôle: {isValidRole(formData.role) ? getRoleLabel(formData.role) : 'Sélectionner un rôle'}
                      </span>
                    </div>
                    <ChevronDown className="ml-2 h-5 w-5 shrink-0 text-gray-700" />
                  </Button>

                  <Dialog open={roleSheetOpen} onOpenChange={setRoleSheetOpen}>
                    <DialogContent className="max-w-md w-[95vw] p-3 sm:max-w-sm">
                      <DialogHeader>
                        <DialogTitle>Choisissez votre rôle</DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-3 py-2">
                        <button
                          type="button"
                          onClick={() => { handleInputChange('role', 'buyer'); setRoleSheetOpen(false); }}
                          className="w-full p-3 rounded-xl border bg-white flex items-center gap-3"
                        >
                          <User className="h-5 w-5 text-primary" />
                          <div>
                            <div className="font-medium text-primary">Client(e)</div>
                            <div className="text-sm text-muted-foreground">Achetez des produits</div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => { handleInputChange('role', 'vendor'); setRoleSheetOpen(false); }}
                          className="w-full p-3 rounded-xl border bg-white flex items-center gap-3"
                        >
                          <ShoppingCart className="h-5 w-5 text-primary" />
                          <div>
                            <div className="font-medium text-primary">Vendeur(se)</div>
                            <div className="text-sm text-muted-foreground">Vendez vos produits</div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => { handleInputChange('role', 'delivery'); setRoleSheetOpen(false); }}
                          className="w-full p-3 rounded-xl border bg-white flex items-center gap-3"
                        >
                          <Truck className="h-5 w-5 text-primary" />
                          <div>
                            <div className="font-medium text-primary">Livreur</div>
                            <div className="text-sm text-muted-foreground">Livrez des commandes</div>
                          </div>
                        </button>

                              <div className="w-full p-3 rounded-xl border border-dashed bg-gray-50 text-sm text-muted-foreground opacity-80">
                                Option par defaut desactivee: choisissez Client(e), Vendeur(se) ou Livreur.
                              </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </>
              ) : (
                      <Select value={formData.role} onValueChange={(value) => handleInputChange('role', value)}>
                  <SelectTrigger className="h-12 rounded-xl border-2 bg-white shadow-none flex items-center px-3 text-base font-semibold focus:ring-2 focus:ring-primary/20 transition-all [&>svg]:h-5 [&>svg]:w-5 [&>svg]:opacity-100 [&>svg]:text-gray-700">
                    <SelectValue placeholder="Sélectionner un rôle" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl shadow-none border mt-2 bg-white max-h-72 overflow-y-auto">
                          <SelectItem value={ROLE_UNSELECTED} disabled className="text-muted-foreground">
                            Sélectionner un rôle (obligatoire)
                          </SelectItem>
                    <SelectItem value="buyer" className="py-2 px-3 hover:bg-primary/10 rounded-lg cursor-pointer">
                      <div className="flex items-start gap-2">
                        <User className="h-5 w-5 text-primary mt-0.5" />
                        <div className="leading-tight">
                          <div className="text-base text-primary">Client(e)</div>
                          <div className="text-xs text-muted-foreground">Achetez des produits</div>
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="vendor" className="py-2 px-3 hover:bg-primary/10 rounded-lg cursor-pointer">
                      <div className="flex items-start gap-2">
                        <ShoppingCart className="h-5 w-5 text-primary mt-0.5" />
                        <div className="leading-tight">
                          <div className="text-base text-primary">Vendeur(se)</div>
                          <div className="text-xs text-muted-foreground">Vendez vos produits</div>
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="delivery" className="py-2 px-3 hover:bg-primary/10 rounded-lg cursor-pointer">
                      <div className="flex items-start gap-2">
                        <Truck className="h-5 w-5 text-primary mt-0.5" />
                        <div className="leading-tight">
                          <div className="text-base text-primary">Livreur</div>
                          <div className="text-xs text-muted-foreground">Livrez des commandes</div>
                        </div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            {/* Champs spécifiques selon le rôle */}
            {formData.role === 'delivery' ? (
              <Select
                value={formData.vehicleInfo || TRANSPORT_UNSELECTED}
                onValueChange={(value) => handleInputChange('vehicleInfo', value === TRANSPORT_UNSELECTED ? '' : value)}
                required
              >
                <SelectTrigger className="h-12 rounded-xl border-2 bg-white shadow-none flex items-center px-3 text-base font-semibold focus:ring-2 focus:ring-primary/20 transition-all [&>svg]:h-5 [&>svg]:w-5 [&>svg]:opacity-100 [&>svg]:text-gray-700">
                  <SelectValue placeholder="Moyen de transport" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-none border mt-2 bg-white max-h-72 overflow-y-auto">
                  <SelectItem value={TRANSPORT_UNSELECTED} disabled className="text-muted-foreground">
                    Choisir un moyen de transport
                  </SelectItem>
                  <SelectItem value="Moto">Moto</SelectItem>
                  <SelectItem value="Scooter">Scooter</SelectItem>
                  <SelectItem value="Vélo">Vélo</SelectItem>
                  <SelectItem value="Voiture">Voiture</SelectItem>
                  <SelectItem value="Triporteur">Triporteur</SelectItem>
                  <SelectItem value="Camionnette">Camionnette</SelectItem>
                  <SelectItem value="Autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <>
                {isValidRole(formData.role) ? (
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
                ) : null}
                {/* Adresse: Select Senegal regions/quartiers + Autre */}
                <Label className="text-sm font-medium mb-2 block">Adresse</Label>
                <Select
                  value={formData.address}
                  onValueChange={(value) => handleInputChange('address', value)}
                  disabled={!isValidRole(formData.role)}
                  required
                >
                  <SelectTrigger className="h-12 rounded-xl border-2 bg-white shadow-none flex items-center px-3 text-base font-semibold focus:ring-2 focus:ring-primary/20 transition-all [&>svg]:h-5 [&>svg]:w-5 [&>svg]:opacity-100 [&>svg]:text-gray-700">
                    <SelectValue placeholder={formData.role === 'vendor' ? 'Adresse de la boutique (obligatoire)' : 'Adresse (obligatoire)'} />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl shadow-none border mt-2 bg-white max-h-72 overflow-y-auto">
                    <SelectItem value={ADDRESS_UNSELECTED} disabled className="text-muted-foreground">
                      Adresse (obligatoire)
                    </SelectItem>
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
                    className="mt-2 h-12 rounded-xl border-2 placeholder:text-sm md:placeholder:text-base placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 transition-shadow shadow-none"
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
              disabled={
                loading
                || !isValidRole(formData.role)
                || formData.fullName.trim().split(/\s+/).filter(Boolean).length < 2
                || ((formData.role === 'buyer' || formData.role === 'vendor') && formData.address === ADDRESS_UNSELECTED)
                || ((formData.role === 'buyer' || formData.role === 'vendor') && formData.address === 'Autre' && formData.customAddress.trim().length === 0)
                || (formData.role === 'delivery' && formData.vehicleInfo.trim().length === 0)
              }
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
