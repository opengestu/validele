import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiUrl } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';

const AdminLoginForm: React.FC = () => {
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
      // Redirection automatique vers la page admin après connexion
      setTimeout(() => {
        navigate('/admin');
      }, 500); // Laisse le toast s'afficher un court instant
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
    <div className="max-w-md mx-auto py-12 text-center">
      <h1 className="text-xl font-bold mb-4">Aperçu - Connexion administrateur</h1>
      <p className="text-gray-600 mb-4">Utilisez ce formulaire pour tester l'endpoint admin login.</p>

      <div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="mb-3 px-3 py-2 border rounded w-full"
          autoComplete="username"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          className="mb-3 px-3 py-2 border rounded w-full"
          autoComplete="current-password"
        />
        <input
          type="text"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          placeholder="Code 2FA (optionnel)"
          className="mb-3 px-3 py-2 border rounded w-full"
        />
        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
        <div className="flex gap-2 justify-center">
          <Button disabled={loading} onClick={submit}>Se connecter</Button>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginForm;
