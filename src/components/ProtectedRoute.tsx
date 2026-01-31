
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { apiUrl } from '@/lib/api';


interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'buyer' | 'vendor' | 'delivery' | 'admin';
}

const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { user, userProfile, loading, isOnline, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [retrying, setRetrying] = React.useState(false);

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
          toast({ title: 'Connexion rétablie', description: 'La connexion au serveur est fonctionnelle.', variant: 'success' });
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

  // // Affichage de chargement - attendre que l'authentification soit prête
  // if (loading) {
  //   // During auth bootstrap we do not show a large overlay spinner; show a simple lightweight text
  //   return (
  //     <div className="min-h-screen bg-gray-50 flex items-center justify-center">
  //       <div className="text-center text-gray-600">Chargement...</div>
  //     </div>
  //   );
  // }

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

  // Autoriser l'accès même si le profil utilisateur n'est pas encore complet.
  // Les pages protégées (dashboards) sont responsables de créer/compléter
  // la ligne de profil dans la base de données et d'afficher un formulaire
  // de complétion si nécessaire. Rediriger automatiquement vers /auth
  // empêche l'accès immédiat après authentification (problème signalé).
  // Si vous souhaitez forcer la complétion, implémentez une page dédiée
  // de "profile setup" et redirigez explicitement vers celle-ci.
  // (On continue si `userProfile` est absent ou `full_name` vide.)


  // Correction : si requiredRole est 'admin', on autorise l'accès même si userProfile n'est pas encore chargé,
  // mais on bloque explicitement l'accès aux autres rôles si userProfile est chargé et différent de 'admin'.
  if (requiredRole === 'admin') {
    if (userProfile && userProfile.role !== 'admin') {
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
