import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PinInput from './PinInput';
import { PhoneAuthForm } from './PhoneAuthForm';
import { useToast } from '@/hooks/use-toast';
import { apiUrl } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';

const PhoneLoginFlow: React.FC = () => {
  const [stage, setStage] = useState<'enter-phone'|'enter-pin'|'signup'>('enter-phone');
  const [phone, setPhone] = useState('');
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotReset, setForgotReset] = useState(false);
  const [simulatingRole, setSimulatingRole] = useState<'buyer'|'vendor'|'delivery'|null>(null);
  const navigate = useNavigate();
  const toast = useToast();

  const DEV_TEST_LAST9 = '777693020';
  const isDevEnv = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') || (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV);

  const normalizeToLast9 = (raw: string) => (raw || '').replace(/\D/g, '').slice(-9);
  const formatAsSenegal = (raw: string) => `+221${normalizeToLast9(raw)}`;

  const simulateDevLogin = async (role: 'buyer' | 'vendor' | 'delivery') => {
    if (!isDevEnv) return;
    if (simulatingRole) return;
    setSimulatingRole(role);
    try {
      const phoneNorm = formatAsSenegal(phone || DEV_TEST_LAST9);
      const profileId = `dev-${role}-${normalizeToLast9(phoneNorm)}`;
      const session = {
        phone: phoneNorm,
        profileId,
        role,
        fullName: `${role.charAt(0).toUpperCase() + role.slice(1)} (test)`,
        loginTime: new Date().toISOString(),
        access_token: role === 'vendor' ? 'dev-token-vendor' : undefined
      } as any;
      localStorage.setItem('sms_auth_session', JSON.stringify(session));
      if (role === 'vendor') localStorage.setItem('auth_token', 'dev-token-vendor');
      await new Promise(r => setTimeout(r, 60));
      const path = role === 'vendor' ? '/vendor' : role === 'delivery' ? '/delivery' : '/buyer';
      try { window.location.replace(path); } catch (e) { window.location.href = path; }
      setTimeout(() => { try { if (window.location.pathname !== path) window.location.href = path; } catch (e) { /* ignore */ } }, 350);
    } catch (e) {
      console.error('simulateDevLogin error', e);
      setSimulatingRole(null);
    }
  };

  const checkExists = async () => {
    if (!phone) return toast.toast({ title: 'Erreur', description: 'Entrez un numéro de téléphone' });

    // Dev shortcut: when entering the special test number, show the local simulator instead
    try {
      const last9 = normalizeToLast9(phone);
      if (isDevEnv && last9 === DEV_TEST_LAST9) {
        // Instead of calling the backend we let the developer choose the role on the next UI render
        setChecking(false);
        setStage('enter-pin');
        return;
      }
    } catch (e) {
      // fallthrough to normal flow
    }

    setChecking(true);
    try {
      const res = await fetch(apiUrl(`/auth/users/exists?phone=${encodeURIComponent(phone)}`));
      const data = await res.json();
      setChecking(false);
      if (res.ok && data.exists) {
        setStage('enter-pin');
      } else {
        // Number not found: open signup flow using existing PhoneAuthForm component
        setStage('signup');
      }
    } catch (e) {
      setChecking(false);
      console.error('checkExists error:', e);
      toast.toast({ title: 'Erreur', description: 'Impossible de vérifier le numéro' });
    }
  };

  const onPinComplete = async (pin: string) => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/auth/login-pin'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, pin }) });
      const data = await res.json();
      setLoading(false);
      if (res.ok && data.success) {
        if (data.token) localStorage.setItem('auth_token', data.token);
        toast.toast({ title: 'Connecté', description: 'Vous êtes connecté.' });
        navigate('/');
      } else {
        toast.toast({ title: 'Erreur', description: data.error || 'PIN invalide' });
      }
    } catch (e) {
      setLoading(false);
      console.error('onPinComplete error:', e);
      toast.toast({ title: 'Erreur', description: 'Erreur serveur' });
    }
  };

  return (
    <div style={{ padding: 24 }}>
      {stage === 'enter-phone' && (
        <div>
          <h2>Bienvenue — entrez votre numéro</h2>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2217xxxxxxxx" style={{ width: '100%', padding: 12, fontSize: 18 }} />
          <button onClick={checkExists} disabled={checking} style={{ marginTop: 16, width: '100%', padding: 12 }}>Suivant</button>

          {/* Quick simulator for the special test number */}
          {isDevEnv && normalizeToLast9(phone || '') === DEV_TEST_LAST9 && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: '#f8fafc', border: '1px solid #e6eef8' }}>
              <div style={{ fontSize: 13, color: '#0b74de', marginBottom: 8 }}>Numéro de test détecté</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => simulateDevLogin('buyer')} disabled={!!simulatingRole} style={{ flex: 1, padding: '8px 10px' }} className="bg-black text-white rounded-lg border border-black flex items-center justify-center gap-2">
                  {simulatingRole === 'buyer' ? (<><Spinner size="sm" className="text-white"/>Ouverture...</>) : 'Simuler Client'}
                </button>
                <button type="button" onClick={() => simulateDevLogin('vendor')} disabled={!!simulatingRole} style={{ flex: 1, padding: '8px 10px' }} className="bg-emerald-600 text-white rounded-lg flex items-center justify-center gap-2">
                  {simulatingRole === 'vendor' ? (<><Spinner size="sm" className="text-white"/>Ouverture...</>) : 'Simuler Vendeur'}
                </button>
                <button type="button" onClick={() => simulateDevLogin('delivery')} disabled={!!simulatingRole} style={{ flex: 1, padding: '8px 10px' }} className="bg-sky-600 text-white rounded-lg flex items-center justify-center gap-2">
                  {simulatingRole === 'delivery' ? (<><Spinner size="sm" className="text-white"/>Ouverture...</>) : 'Simuler Livreur'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {stage === 'enter-pin' && (
        <div style={{ position: 'relative', minHeight: 220 }}>
          <h2>Entrez votre code PIN</h2>
          <PinInput onComplete={onPinComplete} />
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={() => setStage('enter-phone')}>Retour</button>
          </div>
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button
              onClick={() => { setForgotReset(true); setStage('signup'); }}
              style={{
                background: 'white',
                color: '#0b74de',
                border: 'none',
                textDecoration: 'underline',
                cursor: 'pointer',
                borderRadius: 8,
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                padding: '8px 18px',
                fontSize: 15,
                marginTop: 8
              }}
            >
              PIN oublié ?
            </button>
          </div>
        </div>
      )}

      {stage === 'signup' && (
        <div>
          <h2>Créer un compte / Réinitialiser PIN</h2>
          <PhoneAuthForm initialPhone={phone} onBack={() => { setStage('enter-phone'); setForgotReset(false); }} startResetPin={forgotReset} />
        </div>
      )}

    </div>
  );
};

export default PhoneLoginFlow;
