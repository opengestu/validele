
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui/spinner';
import OverlaySpinner from '@/components/ui/overlay-spinner';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'buyer' | 'vendor' | 'delivery' | 'admin';
}

const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { user, userProfile, loading, isOnline, refreshProfile } = useAuth();

  // Affichage de chargement - attendre que l'authentification soit prête
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <OverlaySpinner message="Chargement..." visible />
      </div>
    );
  }

  // Hors connexion: afficher un message avant d'entrer dans les dashboards
  if (!isOnline) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-sm px-6">
          <p className="text-gray-900 font-medium">Pas de connexion</p>
          <p className="text-gray-600 mt-2">
            Vérifiez votre connexion Internet puis réessayez.
          </p>
          <button
            type="button"
            onClick={() => refreshProfile()}
            className="mt-4 inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium"
          >
            Réessayer
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

  // Vérification du rôle si requis (sécurisée si `userProfile` n'est pas encore chargé)
  if (requiredRole && userProfile?.role && userProfile.role !== requiredRole) {
    // Rediriger vers le bon dashboard selon le rôle
    const redirectPath = userProfile.role === 'vendor' ? '/vendor' : 
                        userProfile.role === 'delivery' ? '/delivery' : '/buyer';
    return <Navigate to={redirectPath} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
