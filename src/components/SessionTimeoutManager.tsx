import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { apiUrl, resolveAuthToken } from '@/lib/api';

// Durée minimum en arrière-plan avant de demander le PIN (en ms).
// L'utilisateur ne verra PinReauth que s'il quitte l'app pendant >= ce délai.
const BACKGROUND_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
// Mobile natif: délai aligné à 2 minutes.
const NATIVE_BACKGROUND_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

// Clé localStorage pour stocker la page de retour après re-auth
const REAUTH_RETURN_PATH_KEY = 'reauth_return_path';
const REAUTH_REQUIRED_KEY = 'reauth_required';
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
    return path === '/auth'
      || path === '/pin-reauth'
      || path === '/'
      || path === '/admin'
      || path === '/admin-login'
      || path.startsWith('/admin/')
      || path === '/product'
      || path.startsWith('/product/');
  }, []);

  const getCurrentPathWithQuery = useCallback(() => {
    if (typeof window === 'undefined') return '/';
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }, []);

  // Rediriger vers la page PIN
  const redirectToPinReauth = useCallback(() => {
    const currentPath = window.location.pathname;
    const currentFullPath = getCurrentPathWithQuery();
    if (isExcludedPage(currentPath)) return;

    localStorage.setItem(REAUTH_REQUIRED_KEY, '1');
    localStorage.setItem(REAUTH_RETURN_PATH_KEY, currentFullPath);
    localStorage.removeItem('app_backgrounded_at'); // clean up background timestamp
    navigate('/pin-reauth', { replace: true });
  }, [navigate, isExcludedPage, getCurrentPathWithQuery]);

  // ---------- Suivre l'état d'authentification ----------
  useEffect(() => {
    const hasSmsSession = !!localStorage.getItem('sms_auth_session');
    isAuthenticatedRef.current = !!(user && userProfile) || hasSmsSession;
  }, [user, userProfile]);

  // ---------- Détection arrière-plan / premier plan ----------
  useEffect(() => {
    // Lire puis nettoyer le timestamp de background, et demander le PIN si nécessaire.
    // Fallback: si BACKGROUNDED_AT_KEY n'existe pas (app tuée), utiliser LAST_ACTIVITY_KEY comme référence.
    const evaluateBackgroundElapsed = (source: 'visibility' | 'focus' | 'native' | 'startup') => {
      let bgAtRaw = localStorage.getItem(BACKGROUNDED_AT_KEY);
      let usedFallback = false;

      if (!bgAtRaw) {
        // Fallback pour app tuée: utiliser le timestamp de dernière activité
        bgAtRaw = localStorage.getItem(LAST_ACTIVITY_KEY);
        usedFallback = !!bgAtRaw;
      }

      if (!bgAtRaw) return;

      // Toujours nettoyer BACKGROUNDED_AT_KEY pour éviter qu'un timestamp ancien retrigger plus tard.
      localStorage.removeItem(BACKGROUNDED_AT_KEY);

      const bgAt = Number(bgAtRaw);
      if (!Number.isFinite(bgAt)) return;

      const elapsed = Date.now() - bgAt;
      if (!isAuthenticatedRef.current) return;
      if (isExcludedPage(window.location.pathname)) return;

      const requiredThresholdMs = Capacitor.isNativePlatform() ? NATIVE_BACKGROUND_THRESHOLD_MS : BACKGROUND_THRESHOLD_MS;

      if (elapsed >= requiredThresholdMs) {
        console.info(`[SessionTimeout] (${source}${usedFallback ? '+fallback' : ''}) arrière-plan ${Math.round(elapsed / 1000)}s -> PIN requis`);
        redirectToPinReauth();
      }
    };

    // Quand l'app passe en arrière-plan -> enregistrer le timestamp.
    // Quand l'app revient au premier plan -> vérifier le temps écoulé.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // L'app part en arrière-plan
        const now = Date.now().toString();
        localStorage.setItem(BACKGROUNDED_AT_KEY, now);
        localStorage.setItem(LAST_ACTIVITY_KEY, now); // aussi mettre à jour la dernière activité
        return;
      }

      // document.visibilityState === 'visible' -> l'app revient
      evaluateBackgroundElapsed('visibility');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Même logique sur focus (certains appareils ne déclenchent pas visibilitychange)
    const handleFocus = () => {
      evaluateBackgroundElapsed('focus');
    };

    window.addEventListener('focus', handleFocus);

    // Mobile natif: utiliser le cycle de vie Capacitor pour fiabiliser la sécurité PIN.
    let nativeSub: { remove: () => Promise<void> } | null = null;
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          const now = Date.now().toString();
          localStorage.setItem(BACKGROUNDED_AT_KEY, now);
          localStorage.setItem(LAST_ACTIVITY_KEY, now); // aussi mettre à jour la dernière activité
          return;
        }
        evaluateBackgroundElapsed('native');
      }).then((sub) => {
        nativeSub = sub;
      }).catch(() => {
        // noop
      });
    }

    // Heartbeat: garder LAST_ACTIVITY_KEY frais pour que le redémarrage après app tuée
    // sache quand l'app était active pour la dernière fois.
    // Cela assure que même si appStateChange ne se déclenche pas (app force-killed),
    // on a un timestamp permettant de calculer le temps écoulé.
    const heartbeatInterval = setInterval(() => {
      if (isAuthenticatedRef.current && document.visibilityState === 'visible') {
        localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
      }
    }, 30 * 1000); // toutes les 30 secondes

    // Au montage, gérer un éventuel timestamp conservé après kill/restart.
    evaluateBackgroundElapsed('startup');

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      clearInterval(heartbeatInterval);
      if (nativeSub) {
        nativeSub.remove().catch(() => {
          // noop
        });
      }
    };
  }, [redirectToPinReauth, isExcludedPage]);

  // ---------- Intercepteur global 401 (SEULEMENT pour vraies expirations de session Supabase) ----------
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      // NE intercepter 401 que pour les endpoints sensibles (vérification de session, etc.)
      // PAS pour les requêtes métier normales (update-product, orders, etc.)
      if (response.status === 401 && isAuthenticatedRef.current) {
        const url = String(args[0] || '').toLowerCase();
        const isSessionCheck = url.includes('session') || url.includes('user/me') || url.includes('verify') || url.includes('profile');
        
        if (isSessionCheck) {
          const currentPath = window.location.pathname;
          const currentFullPath = getCurrentPathWithQuery();
          if (!isExcludedPage(currentPath)) {
            console.warn('[SessionTimeout] 401 détecté sur endpoint sensible, redirection vers PIN re-auth');
            localStorage.setItem(REAUTH_REQUIRED_KEY, '1');
            localStorage.setItem(REAUTH_RETURN_PATH_KEY, currentFullPath);
            setTimeout(() => {
              navigate('/pin-reauth', { replace: true });
            }, 100);
          }
        }
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [navigate, isExcludedPage, getCurrentPathWithQuery]);

  // ---------- Heartbeat activité utilisateur ----------
  useEffect(() => {
    let cancelled = false;

    const sendHeartbeat = async () => {
      if (!isAuthenticatedRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

      try {
        const token = await resolveAuthToken();
        if (!token) return;

        await fetch(apiUrl('/api/me/heartbeat'), {
          method: 'POST',
          credentials: 'include',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch {
        // Silent best-effort heartbeat
      }
    };

    const heartbeatTimer = window.setInterval(() => {
      if (!cancelled) {
        void sendHeartbeat();
      }
    }, 30 * 1000);

    void sendHeartbeat();

    return () => {
      cancelled = true;
      window.clearInterval(heartbeatTimer);
    };
  }, []);

  return null;
};

export default SessionTimeoutManager;
export { REAUTH_RETURN_PATH_KEY, REAUTH_REQUIRED_KEY, LAST_ACTIVITY_KEY };
