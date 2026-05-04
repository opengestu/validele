import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiUrl } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';

interface AdminLoginFormProps {
  onSuccess?: () => void;
}

const AdminLoginForm: React.FC<AdminLoginFormProps> = ({ onSuccess }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    // Enable auth spinner visibility for this flow
    if (typeof window !== 'undefined') document.body.classList.add('auth-spinner-enabled');
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/admin/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, otp: otp || undefined })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json?.error || json?.message || 'Identifiants invalides';
        setError(msg);
        toast({ title: 'Erreur', description: msg, variant: 'destructive' });
        return;
      }
      // If server returned session tokens, initialize the Supabase client session
      if (json && (json.access_token || json.refresh_token)) {
        try {
          await supabase.auth.setSession({ access_token: json.access_token, refresh_token: json.refresh_token });
        } catch (e) {
          console.warn('Failed to set supabase session on client:', e);
        }
      }

      toast({ title: 'Authentifié', description: "Vous êtes connecté en tant qu'admin" });

      if (onSuccess) {
        onSuccess();
      } else {
        // Fallback navigation when used standalone.
        navigate('/admin');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err || 'Erreur connexion');
      setError(message);
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
      if (typeof window !== 'undefined') document.body.classList.remove('auth-spinner-enabled');
    }
  };

  return (
    <div className="mx-auto max-w-md rounded-[34px] border border-white/60 bg-white/90 px-5 py-8 text-center shadow-[0_22px_70px_rgba(15,23,42,0.12)] backdrop-blur-md">
      <div className="mb-5 flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-[24px] border border-slate-100 bg-slate-50 shadow-[0_14px_32px_rgba(15,23,42,0.08)]">
          <span className="text-xl font-bold text-slate-800">A</span>
        </div>
      </div>
      <h1 className="mb-2 text-xl font-bold text-slate-900">Connexion administrateur</h1>
      <p className="mb-6 text-sm text-slate-600">Connectez-vous avec votre compte administrateur.</p>

      <div className="space-y-3 text-left">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="h-12 w-full rounded-[18px] border border-white/70 bg-white px-4 text-slate-900 shadow-[0_10px_22px_rgba(15,23,42,0.08)] outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
          autoComplete="username"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          className="h-12 w-full rounded-[18px] border border-white/70 bg-white px-4 text-slate-900 shadow-[0_10px_22px_rgba(15,23,42,0.08)] outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
          autoComplete="current-password"
        />
        <input
          type="text"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          placeholder="Code 2FA (optionnel)"
          className="h-12 w-full rounded-[18px] border border-white/70 bg-white px-4 text-slate-900 shadow-[0_10px_22px_rgba(15,23,42,0.08)] outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
        />
        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
        <div className="flex justify-center pt-2">
          <Button disabled={loading} onClick={submit} className="h-12 rounded-full px-6 shadow-[0_14px_28px_rgba(37,99,235,0.18)]">
            Se connecter
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginForm;
