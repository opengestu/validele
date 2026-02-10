import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { apiUrl } from '@/lib/api';

const SUPABASE_SESSION_KEY = 'supabase_persisted_session';
const PROFILE_CACHE_KEY = 'auth_cached_profile_v1';

// Utility to safely extract an email string from a DB row whose shape may be loose.
const getEmailFromRow = (row: Record<string, unknown> | null | undefined): string | undefined => {
  if (!row) return undefined;
  const v = (row as Record<string, unknown>)['email'];
  return typeof v === 'string' ? v : undefined;
};

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone?: string | null;
  role: 'buyer' | 'vendor' | 'delivery';
  company_name?: string | null;
  address?: string | null;
  vehicle_info?: string | null;
  walletType?: string | null; // Always present if available in DB
  wallet_type?: string | null; // For compatibility with DB field naming
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isOnline: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  userProfile: null,
  loading: true,
  isOnline: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const authModeRef = useRef<'sms' | 'supabase' | null>(null);
  const initializedRef = useRef(false);
  const explicitSignOutRef = useRef(false);
  const hadSupabaseSessionRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const readCachedProfile = (): UserProfile | null => {
      const raw = localStorage.getItem(PROFILE_CACHE_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as UserProfile;
      } catch {
        localStorage.removeItem(PROFILE_CACHE_KEY);
        return null;
      }
    };

    const writeCachedProfile = (profile: UserProfile | null) => {
      if (!profile) {
        localStorage.removeItem(PROFILE_CACHE_KEY);
        return;
      }
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
    };

    const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = 15000) => {
      const controller = new AbortController();
      const id = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { ...options, signal: controller.signal });
      } finally {
        window.clearTimeout(id);
      }
    };

    const persistSupabaseSession = (activeSession: Session | null) => {
      if (!activeSession) {
        // Ne pas effacer automatiquement la dernière session connue ici.
        // Sur mobile, un refresh token peut échouer temporairement (réseau/veille)
        // et provoquer des événements avec session null. On garde la session
        // pour pouvoir tenter une restauration. On ne supprime que lors d'une
        // déconnexion explicite.
        if (explicitSignOutRef.current) {
          localStorage.removeItem(SUPABASE_SESSION_KEY);
        }
        return;
      }

      localStorage.setItem(
        SUPABASE_SESSION_KEY,
        JSON.stringify({
          loginTime: new Date().toISOString(),
          session: activeSession,
        })
      );
    };

    const tryRestoreSupabaseSession = async (): Promise<Session | null> => {
      const raw = localStorage.getItem(SUPABASE_SESSION_KEY);
      if (!raw) return null;

      try {
        const stored = JSON.parse(raw);

        const storedSession: Session | undefined = stored.session;
        if (!storedSession?.refresh_token || !storedSession?.access_token) {
          localStorage.removeItem(SUPABASE_SESSION_KEY);
          return null;
        }

        const { data, error } = await supabase.auth.setSession({
          refresh_token: storedSession.refresh_token,
          access_token: storedSession.access_token,
        });

        if (error || !data.session) {
          console.error('Erreur restauration session locale:', error);
          localStorage.removeItem(SUPABASE_SESSION_KEY);
          return null;
        }

        return data.session;
      } catch (err) {
        console.error('Erreur parsing session persistée:', err);
        localStorage.removeItem(SUPABASE_SESSION_KEY);
        return null;
      }
    };

    // Fonction pour récupérer le profil utilisateur (sans création automatique)
    const fetchUserProfile = async (userId: string, userEmail: string) => {
      try {
        
        // Affiche l'id de l'utilisateur connecté pour debug
        
        // Essayer de récupérer le profil existant
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        
        
        if (error && error.code !== 'PGRST116') {
          // Log détaillé de l'erreur
          const extractErrorMeta = (err: unknown) => {
            if (!err || typeof err !== 'object') return { details: undefined as string | undefined, hint: undefined as string | undefined };
            const e = err as Record<string, unknown>;
            return {
              details: typeof e['details'] === 'string' ? (e['details'] as string) : undefined,
              hint: typeof e['hint'] === 'string' ? (e['hint'] as string) : undefined,
            };
          };
          const { details, hint } = extractErrorMeta(error);
          console.error('Erreur lors du chargement du profil:', {
            message: error.message,
            details,
            hint,
            code: error.code
          });

          // Hors ligne / problème réseau: tenter de servir le profil depuis le cache
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            const cached = readCachedProfile();
            if (cached && cached.id === userId) {
              
              return cached;
            }
          }
          return null;
        }
        
        if (profile && profile.full_name && profile.full_name.trim() !== '') {
          // Le profil existe et est complet, le retourner
          const profObj = profile as Record<string, unknown>;
          const completeProfile: UserProfile = {
            ...profile,
            email: userEmail,
            role: profile.role as 'buyer' | 'vendor' | 'delivery',
            walletType: typeof profObj.walletType === 'string' ? profObj.walletType as string : (typeof profObj.wallet_type === 'string' ? profObj.wallet_type as string : null),
            wallet_type: typeof profObj.wallet_type === 'string' ? profObj.wallet_type as string : (typeof profObj.walletType === 'string' ? profObj.walletType as string : null)
          };
          writeCachedProfile(completeProfile);
          
          return completeProfile;
        } else {
          // Profil inexistant ou incomplet - ne pas créer automatiquement
          // L'utilisateur doit compléter son inscription
          
          // Hors ligne: si on a déjà un profil complet en cache, l'utiliser
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            const cached = readCachedProfile();
            if (cached && cached.id === userId && cached.full_name && cached.full_name.trim() !== '') {
              
              return cached;
            }
          }
          return null;
        }
      } catch (error) {
        console.error('Erreur lors de la récupération du profil:', error);
        // Hors ligne / problème réseau: tenter le cache
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          const cached = readCachedProfile();
          if (cached?.id === userId) {
            
            return cached;
          }
        }
        return null;
      }
    };

    // Gérer les changements d'état d'authentification
    const applySupabaseAuthState = (event: string, activeSession: Session | null) => {
      if (!mounted) return;

      
      
      setSession(activeSession);
      setUser(activeSession?.user ?? null);

      if (activeSession?.user) {
        hadSupabaseSessionRef.current = true;
      }

      // Conserver la session Supabase pour pouvoir la restaurer en cas de glitch.
      persistSupabaseSession(activeSession);
      
      if (activeSession?.user) {
        // Charger le profil (sans création automatique)
        setTimeout(() => {
          fetchUserProfile(
            activeSession.user.id, 
            activeSession.user.email || ''
          ).then(profile => {
            if (mounted) {
              setUserProfile(profile);
              setLoading(false);
            }
          });
        }, 0);
      } else {
        setUserProfile(null);
        setLoading(false);
      }
    };

    const tryRecoverSupabaseSession = async (): Promise<Session | null> => {
      try {
        const { data: { session: current } } = await supabase.auth.getSession();
        if (current) return current;
      } catch {
        // Ignorer: on tente ensuite la restauration locale.
      }
      try {
        return await tryRestoreSupabaseSession();
      } catch {
        return null;
      }
    };

    // Vérifier la session existante
    const checkSession = async () => {
      try {
        // D'abord, vérifier s'il y a une session SMS dans localStorage
        const smsSessionStr = localStorage.getItem('sms_auth_session');
        if (smsSessionStr) {
          try {
            const smsSession = JSON.parse(smsSessionStr);
            const buildProfileFromSmsSession = (sessionLike: { profileId?: string; phone?: string; fullName?: string; role?: string }) => {
              if (!sessionLike?.profileId) return null;
              return {
                id: sessionLike.profileId,
                email: `${sessionLike.phone || ''}@sms.validele.app`,
                full_name: sessionLike.fullName || '',
                phone: sessionLike.phone || null,
                role: (sessionLike.role ?? 'buyer') as 'buyer' | 'vendor' | 'delivery',
                company_name: null,
                vehicle_info: null,
                walletType: null,
                wallet_type: null
              } as UserProfile;
            };

            // Session SMS - charger le profil via l'endpoint admin pour éviter les RLS
            try {
              const resp = await fetchWithTimeout(
                apiUrl(`/auth/users/exists?phone=${encodeURIComponent(smsSession.phone)}`),
                { method: 'GET' },
                7000
              );
              if (resp.ok) {
                const json = await resp.json().catch(() => null);
                if (json && json.exists && json.profile) {
                  const p = json.profile as { id: string; full_name?: string; role?: string; phone?: string };
                  if (mounted) {
                    authModeRef.current = 'sms';
                    setUser({
                      id: p.id,
                      app_metadata: {},
                      user_metadata: {},
                      aud: 'authenticated',
                      created_at: new Date().toISOString()
                    } as User);

                    const profileObj: UserProfile = {
                      id: p.id,
                      email: getEmailFromRow(null) || `${smsSession.phone}@sms.validele.app`,
                      full_name: p.full_name || '',
                      phone: p.phone || smsSession.phone,
                      role: (p.role ?? 'buyer') as 'buyer' | 'vendor' | 'delivery',
                      company_name: null,
                      vehicle_info: null,
                      walletType: typeof (p as Record<string, unknown>).walletType === 'string' ? (p as Record<string, unknown>).walletType as string : (typeof (p as Record<string, unknown>).wallet_type === 'string' ? (p as Record<string, unknown>).wallet_type as string : null),
                      wallet_type: typeof (p as Record<string, unknown>).wallet_type === 'string' ? (p as Record<string, unknown>).wallet_type as string : (typeof (p as Record<string, unknown>).walletType === 'string' ? (p as Record<string, unknown>).walletType as string : null)
                    };

                    setUserProfile(profileObj);
                    writeCachedProfile(profileObj);
                    // If SMS session contains an access_token, inject it into Realtime so RLS sees the correct auth.uid()
                    try {
                      if ((smsSession as any)?.access_token) {
                        try {
                          supabase.realtime.setAuth((smsSession as any).access_token);
                          console.log('[Auth] Realtime auth injected (SMS session restore)');
                        } catch (e) {
                          console.warn('[Auth] supabase.realtime.setAuth failed during SMS session restore', e);
                        }
                      }
                    } catch (e) {
                      // ignore
                    }
                    setLoading(false);
                    return; // Session SMS trouvée
                  }
                } else {
                  // Profil introuvable côté serveur: nettoyer la session
                  localStorage.removeItem('sms_auth_session');
                }
              } else {
                console.error('Erreur lors de la récupération du profil SMS via backend:', resp.status);
                const fallbackProfile = buildProfileFromSmsSession(smsSession);
                if (fallbackProfile && mounted) {
                  authModeRef.current = 'sms';
                  setUser({
                    id: fallbackProfile.id,
                    app_metadata: {},
                    user_metadata: {},
                    aud: 'authenticated',
                    created_at: new Date().toISOString()
                  } as User);
                  setUserProfile(fallbackProfile);
                  writeCachedProfile(fallbackProfile);                  try {
                    if ((smsSession as any)?.access_token) {
                      try {
                        supabase.realtime.setAuth((smsSession as any).access_token);
                        console.log('[Auth] Realtime auth injected (SMS session fallback)');
                      } catch (e) {
                        console.warn('[Auth] supabase.realtime.setAuth failed during SMS session fallback', e);
                      }
                    }
                  } catch (e) { /* ignore */ }                  setLoading(false);
                  return;
                }
              }
            } catch (err: unknown) {
              if (err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError') {
                console.warn('Récupération profil SMS via backend: délai dépassé (timeout)');
              } else {
                console.error('Erreur récupération profil SMS via backend:', err);
              }
              const fallbackProfile = buildProfileFromSmsSession(smsSession);
              if (fallbackProfile && mounted) {
                authModeRef.current = 'sms';
                setUser({
                  id: fallbackProfile.id,
                  app_metadata: {},
                  user_metadata: {},
                  aud: 'authenticated',
                  created_at: new Date().toISOString()
                } as User);
                setUserProfile(fallbackProfile);
                writeCachedProfile(fallbackProfile);
                setLoading(false);
                return;
              }
              // En hors-ligne, utiliser le cache si disponible
              if (typeof navigator !== 'undefined' && !navigator.onLine) {
                const cached = readCachedProfile();
                if (cached && cached.id === smsSession.profileId) {
                  if (mounted) {
                    authModeRef.current = 'sms';
                    setUser({
                      id: cached.id,
                      app_metadata: {},
                      user_metadata: {},
                      aud: 'authenticated',
                      created_at: new Date().toISOString()
                    } as User);
                    setUserProfile(cached);
                    setLoading(false);
                    return;
                  }
                }
              }

              // Nettoyer la session si on ne peut pas récupérer le profil
              localStorage.removeItem('sms_auth_session');
            }
          } catch (parseError) {
            console.error('Erreur parsing session SMS:', parseError);
            localStorage.removeItem('sms_auth_session');
          }
        }
        
        // Pas de session SMS valide, vérifier Supabase Auth normal
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Erreur lors de la récupération de la session:', error);
        }

        // Ensure the session is persisted to our local storage key so subsequent
        // SDK/REST calls (and page reloads) have the tokens available.
        try {
          if (session && !localStorage.getItem(SUPABASE_SESSION_KEY)) {
            persistSupabaseSession(session);
            
          }
        } catch (e) {
          console.warn('failed to persist session during bootstrap', e);
        }

        // Defensive: ensure the Supabase client internal state is initialized
        // with the session tokens. Some environments may return a session
        // from the server but the client hasn't fully wired the tokens into
        // its internal auth storage; calling setSession is idempotent and
        // ensures subsequent getUser() and REST calls have a token.
        try {
          if (session && session.access_token && session.refresh_token) {
            await supabase.auth.setSession({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            });
            
          }
        } catch (e) {
          console.warn('supabase.auth.setSession failed during bootstrap', e);
        }

        // Si aucune session n'est retournée, essayer de restaurer la dernière session valide (<24h)
        if (!session) {
          const restoredSession = await tryRestoreSupabaseSession();
          if (restoredSession) {
            authModeRef.current = 'supabase';
            applySupabaseAuthState('restored', restoredSession);
            return;
          }
        }

        authModeRef.current = session ? 'supabase' : null;
        hadSupabaseSessionRef.current = !!session?.user;
        applySupabaseAuthState('initial', session);
      } catch (error) {
        console.error('Erreur lors de la vérification de la session:', error);
        if (mounted) {
          setLoading(false);
        }
      } finally {
        // Marquer l'initialisation comme terminée pour éviter des faux "signed out"
        // pendant le bootstrap (certains navigateurs/contexts émettent un event null).
        initializedRef.current = true;
      }
    };

    // Vérifier la session initiale, puis écouter les changements
    checkSession();

    // Inject Realtime token at startup (supabase-js v2)
    try {
      supabase.auth.getSession().then(({ data }) => {
        const accessToken = data?.session?.access_token;
        if (accessToken) {
          try {
            supabase.realtime.setAuth(accessToken);
            console.log('[Auth] Realtime auth injected');
          } catch (e) {
            console.warn('[Auth] failed to inject realtime auth at startup', e);
          }
        }
      }).catch((err) => console.warn('[Auth] supabase.auth.getSession() failed', err));
    } catch (e) {
      console.warn('[Auth] supabase.auth.getSession() threw', e);
    }

    // Watchdog: si le bootstrap d'auth reste bloqué (>5s), sortir du mode loading
    // avec autoRefreshToken désactivé, le timeout peut être plus court
    const authWatchdog = setTimeout(() => {
      if (mounted && initializedRef.current === false) {
        console.warn('Auth bootstrap timeout — forçant la fin du chargement');
        setLoading(false);
        initializedRef.current = true;
      }
    }, 5000);

    // Configurer l'écoute des changements d'état
    // Note: avec autoRefreshToken=false, onAuthStateChange n'essaiera pas de rafraîchir directement
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, activeSession) => {
      try {
        // Pendant l'initialisation, ignorer les événements (surtout ceux avec session null)
        // pour éviter une redirection prématurée vers /auth.
        if (!initializedRef.current) {
          return;
        }

      // Si on est connecté via SMS (user virtuel), ignorer les événements Supabase
      // qui indiquent une session nulle (sinon ça "déconnecte" l'utilisateur).
      if (authModeRef.current === 'sms' && !activeSession) {
        return;
      }

      // Hors ligne: ne pas écraser l'état utilisateur avec une session null.
      // Sur Android, une perte réseau/veille peut provoquer des events null.
      if (!activeSession && (typeof navigator !== 'undefined' && !navigator.onLine)) {
        setIsOnline(false);
        setLoading(false);
        return;
      }

      // Si on reçoit un SIGNED_OUT inattendu alors qu'on était connecté,
      // tenter une récupération avant de considérer l'utilisateur déconnecté.
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      const canAutoRecover =
        !explicitSignOutRef.current &&
        authModeRef.current === 'supabase' &&
        hadSupabaseSessionRef.current &&
        !activeSession &&
        event === 'SIGNED_OUT' &&
        !path.startsWith('/auth');

      if (canAutoRecover) {
        (async () => {
          const recovered = await tryRecoverSupabaseSession();
          if (recovered) {
            authModeRef.current = 'supabase';
            applySupabaseAuthState('recovered', recovered);
          } else {
            authModeRef.current = null;
            hadSupabaseSessionRef.current = false;
            applySupabaseAuthState(event, null);
          }
        })();
        return;
      }

      authModeRef.current = activeSession ? 'supabase' : null;
      if (!activeSession) {
        hadSupabaseSessionRef.current = false;
      }
      applySupabaseAuthState(event, activeSession);
      } catch (error) {
        // Ignorer les erreurs CORS ou NetworkError pendant le bootstrap
        const errorMsg = (error as any)?.message || String(error);
        if (errorMsg.includes('CORS') || errorMsg.includes('NetworkError') || errorMsg.includes('Failed to fetch')) {
          console.warn('[useAuth] Erreur CORS/Network lors du bootstrap d\'auth, continuant avec cache:', errorMsg);
          // Continuer sans crash - le watchdog gérera le reste
          return;
        }
        // Autres erreurs: logger mais ne pas crash
        console.error('[useAuth] Erreur dans onAuthStateChange:', error);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const signOut = async () => {
    try {
      explicitSignOutRef.current = true;
      hadSupabaseSessionRef.current = false;
      // Nettoyer la session SMS si elle existe
      localStorage.removeItem('sms_auth_session');
      localStorage.removeItem(SUPABASE_SESSION_KEY);
      localStorage.removeItem(PROFILE_CACHE_KEY);
      
      // Déconnecter aussi de Supabase Auth (pour les utilisateurs email)
      await supabase.auth.signOut();
      setUserProfile(null);
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
    } finally {
      // Laisser un micro-délai pour que l'event SIGNED_OUT soit traité.
      setTimeout(() => {
        explicitSignOutRef.current = false;
      }, 0);
    }
  };

  // Fonction pour rafraîchir le profil utilisateur
  const refreshProfile = async () => {
    try {
      // Si session SMS, rafraîchir via l'id du profil
      const smsSessionStr = localStorage.getItem('sms_auth_session');
      if (smsSessionStr) {
        const smsSession = JSON.parse(smsSessionStr);
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', smsSession.profileId)
          .maybeSingle();

        if (!error && profile && profile.full_name) {
          const profObj = profile as Record<string, unknown>;
          let walletType: string | null = null;
          let wallet_type: string | null = null;
          if (typeof profObj.walletType === 'string') walletType = profObj.walletType;
          else if (typeof profObj.wallet_type === 'string') walletType = profObj.wallet_type;
          if (typeof profObj.wallet_type === 'string') wallet_type = profObj.wallet_type;
          else if (typeof profObj.walletType === 'string') wallet_type = profObj.walletType;
          const refreshed: UserProfile = {
            ...profile,
            email: getEmailFromRow(profile) || `${smsSession.phone}@sms.validele.app`,
            role: profile.role as 'buyer' | 'vendor' | 'delivery',
            walletType,
            wallet_type
          };
          setUserProfile(refreshed);
          localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(refreshed));
        }
        return;
      }

      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', currentUser.id)
          .maybeSingle();
        
        if (!error && profile && profile.full_name) {
          const profObj = profile as Record<string, unknown>;
          let walletType: string | null = null;
          let wallet_type: string | null = null;
          if (typeof profObj.walletType === 'string') walletType = profObj.walletType;
          else if (typeof profObj.wallet_type === 'string') walletType = profObj.wallet_type;
          if (typeof profObj.wallet_type === 'string') wallet_type = profObj.wallet_type;
          else if (typeof profObj.walletType === 'string') wallet_type = profObj.walletType;
          const refreshed: UserProfile = {
            ...profile,
            email: currentUser.email || '',
            role: profile.role as 'buyer' | 'vendor' | 'delivery',
            walletType,
            wallet_type
          };
          setUserProfile(refreshed);
          localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(refreshed));
        }
      }
    } catch (error) {
      console.error('Erreur lors du rafraîchissement du profil:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, userProfile, loading, isOnline, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
