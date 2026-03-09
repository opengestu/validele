import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// Durée minimum en arrière-plan avant de demander le PIN (en ms).
// L'utilisateur ne verra PinReauth que s'il quitte l'app pendant >= ce délai.
const BACKGROUND_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

// Clé localStorage pour stocker la page de retour après re-auth
const REAUTH_RETURN_PATH_KEY = 'reauth_return_path';
// Clé localStorage pour stocker le timestamp de la dernière activité
const LAST_ACTIVITY_KEY = 'last_activity_timestamp';
// Clé pour le moment où l'app est passée en arrière-plan
const BACKGROUNDED_AT_KEY = 'app_backgrounded_at';

/**
 * Gère la re-authentification par PIN.
 *
 * Principe : le PIN n'est demandé QUE lorsque l'utilisateur **quitte l'application**
 * (mise en arrière-plan / écran éteint) et revient après un certain délai.
 * Aucun timer d'inactivité ne tourne pendant l'utilisation active.
 *
 * Intercepte aussi les réponses 401 pour rediriger immédiatement.
 */
const SessionTimeoutManager: React.FC = () => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const isAuthenticatedRef = useRef(false);

  // Pages qui ne doivent pas déclencher la re-auth
  const isExcludedPage = useCallback((path: string) => {
    return path === '/auth' || path === '/pin-reauth' || path === '/';
  }, []);

  // Rediriger vers la page PIN
  const redirectToPinReauth = useCallback(() => {
    const currentPath = window.location.pathname;
    if (isExcludedPage(currentPath)) return;

    localStorage.setItem(REAUTH_RETURN_PATH_KEY, currentPath);
    navigate('/pin-reauth', { replace: true });
  }, [navigate, isExcludedPage]);

  // ---------- Suivre l'état d'authentification ----------
  useEffect(() => {
    const hasSmsSession = !!localStorage.getItem('sms_auth_session');
    isAuthenticatedRef.current = !!(user && userProfile) || hasSmsSession;
  }, [user, userProfile]);

  // ---------- Détection arrière-plan / premier plan ----------
  useEffect(() => {
    // Quand l'app passe en arrière-plan → enregistrer le timestamp.
    // Quand l'app revient au premier plan → vérifier le temps écoulé.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // L'app part en arrière-plan
        localStorage.setItem(BACKGROUNDED_AT_KEY, Date.now().toString());
        return;
      }

      // document.visibilityState === 'visible' → l'app revient
      if (!isAuthenticatedRef.current) return;
      if (isExcludedPage(window.location.pathname)) return;

      const bgAt = localStorage.getItem(BACKGROUNDED_AT_KEY);
      if (!bgAt) return;

      const elapsed = Date.now() - parseInt(bgAt, 10);
      localStorage.removeItem(BACKGROUNDED_AT_KEY);

      if (elapsed >= BACKGROUND_THRESHOLD_MS) {
        console.info(`[SessionTimeout] App en arrière-plan ${Math.round(elapsed / 1000)}s → PIN requis`);
        redirectToPinReauth();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Même logique sur focus (certains appareils ne déclenchent pas visibilitychange)
    const handleFocus = () => {
      if (!isAuthenticatedRef.current) return;
      if (isExcludedPage(window.location.pathname)) return;

      const bgAt = localStorage.getItem(BACKGROUNDED_AT_KEY);
      if (!bgAt) return;

      const elapsed = Date.now() - parseInt(bgAt, 10);
      localStorage.removeItem(BACKGROUNDED_AT_KEY);

      if (elapsed >= BACKGROUND_THRESHOLD_MS) {
        console.info(`[SessionTimeout] Focus regagné après ${Math.round(elapsed / 1000)}s → PIN requis`);
        redirectToPinReauth();
      }
    };

    window.addEventListener('focus', handleFocus);

    // Au montage, vérifier si l'app a été tuée puis relancée avec un timestamp ancien
    const bgAt = localStorage.getItem(BACKGROUNDED_AT_KEY);
    if (bgAt) {
      const elapsed = Date.now() - parseInt(bgAt, 10);
      if (elapsed >= BACKGROUND_THRESHOLD_MS && isAuthenticatedRef.current && !isExcludedPage(window.location.pathname)) {
        localStorage.removeItem(BACKGROUNDED_AT_KEY);
        redirectToPinReauth();
      } else {
        // L'app est revenue rapidement, nettoyer
        localStorage.removeItem(BACKGROUNDED_AT_KEY);
      }
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [redirectToPinReauth, isExcludedPage]);

  // ---------- Intercepteur global 401 ----------
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      if (response.status === 401 && isAuthenticatedRef.current) {
        const currentPath = window.location.pathname;
        if (!isExcludedPage(currentPath)) {
          console.warn('[SessionTimeout] 401 détecté, redirection vers PIN re-auth');
          localStorage.setItem(REAUTH_RETURN_PATH_KEY, currentPath);
          setTimeout(() => {
            navigate('/pin-reauth', { replace: true });
          }, 100);
        }
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [navigate, isExcludedPage]);

  return null;
};

export default SessionTimeoutManager;
export { REAUTH_RETURN_PATH_KEY, LAST_ACTIVITY_KEY };
