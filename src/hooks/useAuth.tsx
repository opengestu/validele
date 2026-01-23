
import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

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
  vehicle_info?: string | null;
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
        // Essayer de récupérer le profil existant
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        
        if (error && error.code !== 'PGRST116') {
          console.error('Erreur lors du chargement du profil:', error);
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
          const completeProfile = {
            ...profile,
            email: userEmail,
            role: profile.role as 'buyer' | 'vendor' | 'delivery'
          };
          writeCachedProfile(completeProfile);
          return completeProfile;
        } else {
          // Profil inexistant ou incomplet - ne pas créer automatiquement
          // L'utilisateur doit compléter son inscription
          console.log('Profil inexistant ou incomplet pour:', userId);
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

      console.log('Auth state changed:', event, activeSession?.user?.id);
      
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

            // Session SMS - charger le profil depuis Supabase (pas d'expiration automatique)
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', smsSession.profileId)
              .single();

            if (profile && !profileError) {
              if (mounted) {
                authModeRef.current = 'sms';
                // Créer un objet User virtuel pour les utilisateurs SMS
                setUser({
                  id: profile.id,
                  app_metadata: {},
                  user_metadata: {},
                  aud: 'authenticated',
                  created_at: profile.created_at
                } as User);

                setUserProfile({
                  id: profile.id,
                  email: getEmailFromRow(profile) || `${smsSession.phone}@sms.validele.app`,
                  full_name: profile.full_name,
                  phone: profile.phone,
                  role: profile.role as 'buyer' | 'vendor' | 'delivery',
                  company_name: profile.company_name,
                  vehicle_info: profile.vehicle_info
                });

                writeCachedProfile({
                  id: profile.id,
                  email: getEmailFromRow(profile) || `${smsSession.phone}@sms.validele.app`,
                  full_name: profile.full_name,
                  phone: profile.phone,
                  role: profile.role as 'buyer' | 'vendor' | 'delivery',
                  company_name: profile.company_name,
                  vehicle_info: profile.vehicle_info
                });

                setLoading(false);
                return; // Session SMS trouvée, pas besoin de vérifier Supabase Auth
              }
            } else {
              // Hors ligne: essayer avec le cache au lieu de "déconnecter"
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
              // Profil introuvable, nettoyer la session
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

    // Watchdog: si le bootstrap d'auth reste bloqué (>12s), sortir du mode loading
    const authWatchdog = setTimeout(() => {
      if (mounted && initializedRef.current === false) {
        console.warn('Auth bootstrap timeout — forçant la fin du chargement');
        setLoading(false);
        initializedRef.current = true;
      }
    }, 12000);

    // Configurer l'écoute des changements d'état
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, activeSession) => {
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
          const refreshed: UserProfile = {
            ...profile,
            email: getEmailFromRow(profile) || `${smsSession.phone}@sms.validele.app`,
            role: profile.role as 'buyer' | 'vendor' | 'delivery'
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
          const refreshed: UserProfile = {
            ...profile,
            email: currentUser.email || '',
            role: profile.role as 'buyer' | 'vendor' | 'delivery'
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
