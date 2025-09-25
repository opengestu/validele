
import { useState, useEffect, createContext, useContext } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: 'buyer' | 'vendor' | 'delivery';
  company_name?: string;
  vehicle_info?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  userProfile: null,
  loading: true,
  signOut: async () => {},
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

  useEffect(() => {
    let mounted = true;

    // Fonction pour récupérer ou créer le profil utilisateur
    const fetchOrCreateUserProfile = async (userId: string, userEmail: string, userMetadata?: Record<string, unknown>) => {
      try {
        // Essayer de récupérer le profil existant
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        
        if (error && error.code !== 'PGRST116') {
          console.error('Erreur lors du chargement du profil:', error);
          return null;
        }
        
        if (profile) {
          // Le profil existe, le retourner
          return {
            ...profile,
            email: userEmail,
            role: profile.role as 'buyer' | 'vendor' | 'delivery'
          };
        } else {
          // Le profil n'existe pas, le créer avec les métadonnées de l'utilisateur si disponibles
          console.log('Création du profil pour l\'utilisateur:', userId);
          const defaultRole = userMetadata?.role || 'buyer';
          const defaultFullName = userMetadata?.full_name || userEmail.split('@')[0];
          
          // Essayer d'insérer le profil avec l'ID utilisateur
          let newProfile;
          const { data: insertData, error: insertError } = await supabase
            .from('profiles')
            .insert([{
              id: userId,
              full_name: defaultFullName as string,
              role: defaultRole as string,
            }])
            .select()
            .single();

          if (insertError) {
            // Si l'insertion échoue (profil existe déjà), essayer de le mettre à jour
            console.log('Profil existe déjà, mise à jour...', insertError);
            const { data: updateData, error: updateError } = await supabase
              .from('profiles')
              .update({
                full_name: defaultFullName as string,
                role: defaultRole as string,
              })
              .eq('id', userId)
              .select()
              .single();

            if (updateError) {
              console.error('Erreur lors de la mise à jour du profil:', updateError);
              return null;
            }
            newProfile = updateData;
          } else {
            newProfile = insertData;
          }

          return {
            ...newProfile,
            email: userEmail,
            role: newProfile.role as 'buyer' | 'vendor' | 'delivery'
          };
        }
      } catch (error) {
        console.error('Erreur lors de la récupération/création du profil:', error);
        return null;
      }
    };

    // Gérer les changements d'état d'authentification
    const handleAuthStateChange = (event: string, session: Session | null) => {
      if (!mounted) return;

      console.log('Auth state changed:', event, session?.user?.id);
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Charger ou créer le profil
        setTimeout(() => {
          fetchOrCreateUserProfile(
            session.user.id, 
            session.user.email || '', 
            session.user.user_metadata
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

    // Vérifier la session existante
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Erreur lors de la récupération de la session:', error);
        }

        handleAuthStateChange('initial', session);
      } catch (error) {
        console.error('Erreur lors de la vérification de la session:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    // Configurer l'écoute des changements d'état
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthStateChange);

    // Vérifier la session initiale
    checkSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUserProfile(null);
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, userProfile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
