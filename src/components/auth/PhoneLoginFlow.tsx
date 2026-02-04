import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PinInput from './PinInput';
import { PhoneAuthForm } from './PhoneAuthForm';
import { useToast } from '@/hooks/use-toast';
import { apiUrl } from '@/lib/api';

const PhoneLoginFlow: React.FC = () => {
  const [stage, setStage] = useState<'enter-phone'|'enter-pin'|'signup'>('enter-phone');
  const [phone, setPhone] = useState('');
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotReset, setForgotReset] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const checkExists = async () => {
    if (!phone) return toast.toast({ title: 'Erreur', description: 'Entrez un numéro de téléphone' });
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
