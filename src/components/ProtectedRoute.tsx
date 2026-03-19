
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { apiUrl } from '@/lib/api';
import { LAST_ACTIVITY_KEY, REAUTH_REQUIRED_KEY, REAUTH_RETURN_PATH_KEY } from '@/components/SessionTimeoutManager';


interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'buyer' | 'vendor' | 'delivery' | 'admin';
}

const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { user, userProfile, loading, isOnline, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [retrying, setRetrying] = React.useState(false);
  const REAUTH_BACKGROUND_THRESHOLD_MS = 2 * 60 * 1000;

  async function handleRetry() {
    try {
      setRetrying(true);
      // Quick offline check
      if (typeof window !== 'undefined' && !window.navigator.onLine) {
        toast({ title: 'Toujours hors-ligne', description: "Vérifiez votre connexion Internet et réessayez.", variant: 'destructive' });
        return;
      }

      // Try to refresh profile (works for SMS or Supabase sessions)
      try {
        await refreshProfile();
      } catch (e) {
        // ignore, we still attempt ping
      }

      // Ping server /api/test with timeout
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const resp = await fetch(apiUrl('/api/test'), { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        if (resp.ok) {
          toast({ title: 'Connexion rétablie', description: 'La connexion au serveur est fonctionnelle.' });
          // Dispatch a synthetic online event to allow listeners to update
          if (typeof window !== 'undefined') window.dispatchEvent(new Event('online'));
        } else {
          toast({ title: 'Problème serveur', description: 'Impossible d\'atteindre le serveur. Réessayez plus tard.', variant: 'destructive' });
        }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        if (err && err.name === 'AbortError') {
          toast({ title: 'Délai dépassé', description: 'La vérification a pris trop de temps. Vérifiez votre connexion et réessayez.', variant: 'destructive' });
        } else {
          toast({ title: 'Échec', description: `Impossible de contacter le serveur (${String(err?.message || err)}).`, variant: 'destructive' });
        }
      }
    } finally {
      setRetrying(false);
    }
  }

  // Verrou PIN prioritaire: vérifier AVANT le bypass loading pour empêcher
  // toute apparition du dashboard pendant l'initialisation quand le PIN est requis.
  if (typeof window !== 'undefined') {
    const currentPath = window.location.pathname;
    const isAdminPath = currentPath === '/admin' || currentPath.startsWith('/admin/');
    const lockAlreadyRequired = localStorage.getItem(REAUTH_REQUIRED_KEY) === '1';
    if (!lockAlreadyRequired && !isAdminPath && requiredRole !== 'admin') {
      const now = Date.now();
      const bgAtRaw = localStorage.getItem('app_backgrounded_at') || localStorage.getItem(LAST_ACTIVITY_KEY);
      const bgAt = Number(bgAtRaw);
      const hasSmsSession = !!localStorage.getItem('sms_auth_session');
      const hasAuthenticatedContext = !!user || hasSmsSession;

      if (hasAuthenticatedContext && Number.isFinite(bgAt) && now - bgAt >= REAUTH_BACKGROUND_THRESHOLD_MS) {
        localStorage.setItem(REAUTH_REQUIRED_KEY, '1');
        localStorage.setItem(REAUTH_RETURN_PATH_KEY, window.location.pathname);
      }
    }
  }

  if (
    typeof window !== 'undefined' &&
    requiredRole !== 'admin' &&
    window.location.pathname !== '/admin' &&
    !window.location.pathname.startsWith('/admin/') &&
    localStorage.getItem(REAUTH_REQUIRED_KEY) === '1'
  ) {
    return <Navigate to="/pin-reauth" replace />;
  }

  // Affichage de chargement - attendre que l'authentification soit prête
  // On rend les children derrière + un overlay transparent par-dessus
  // pour que l'utilisateur voie le contenu de l'app pendant le chargement
  if (loading) {
    return <>{children}</>;
  }

  // Hors connexion
  if (!isOnline) {
    // Si on a déjà un user ou userProfile, afficher l'app en mode limité + bannière non bloquante
    if (user || userProfile) {
      return (
        <>
          <div className="fixed inset-x-0 top-0 z-50 bg-yellow-50 border-b border-yellow-200 p-3">
            <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
              <div className="text-yellow-900">Hors‑ligne. Certaines actions nécessitent une connexion.</div>
              <div>
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={retrying}
                  className="inline-flex items-center justify-center rounded-md border border-yellow-300 bg-yellow-100 px-3 py-1 text-sm font-medium"
                >
                  {retrying ? 'Vérification…' : 'Réessayer'}
                </button>
              </div>
            </div>
          </div>
          <div style={{ paddingTop: 64 }}>
            {children}
          </div>
        </>
      );
    }

    // Sinon, afficher le message plein écran (utilisateur non authentifié)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-sm px-6">
          <p className="text-gray-900 font-medium">Pas de connexion</p>
          <p className="text-gray-600 mt-2">Vérifiez votre connexion Internet puis réessayez.</p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-4 inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium"
          >
            {retrying ? 'Vérification…' : 'Réessayer'}
          </button>
        </div>
      </div>
    );
  }

  // Redirection si pas connecté
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Correction : si requiredRole est 'admin', on autorise l'accès même si userProfile n'est pas encore chargé,
  // mais on bloque explicitement l'accès aux autres rôles si userProfile est chargé et différent de 'admin'.
  if (requiredRole === 'admin') {
    if (userProfile && (userProfile.role as string) !== 'admin') {
      // Si le profil est chargé et n'est pas admin, on redirige
      const redirectPath = userProfile.role === 'vendor' ? '/vendor' : 
                          userProfile.role === 'delivery' ? '/delivery' : '/buyer';
      return <Navigate to={redirectPath} replace />;
    }
    // Sinon, on laisse passer (même si userProfile n'est pas encore chargé)
  } else if (requiredRole && userProfile?.role && userProfile.role !== requiredRole) {
    // Pour les autres rôles, logique standard
    const redirectPath = userProfile.role === 'vendor' ? '/vendor' : 
                        userProfile.role === 'delivery' ? '/delivery' : '/buyer';
    return <Navigate to={redirectPath} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
