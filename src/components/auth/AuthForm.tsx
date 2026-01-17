
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { toFrenchErrorMessage } from '@/lib/errors';
import PasswordInput from './PasswordInput';
import RoleSpecificFields from './RoleSpecificFields';

interface AuthFormProps {
  isLogin: boolean;
  onToggleMode: () => void;
}

const AuthForm = ({ isLogin, onToggleMode }: AuthFormProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    phone: '',
    role: 'buyer' as 'buyer' | 'vendor' | 'delivery',
    companyName: '',
    vehicleInfo: '',
    address: '',
    walletType: 'wave-senegal'
  });
  
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSignUp = async () => {
    if (!formData.email || !formData.password || !formData.fullName) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir tous les champs obligatoires",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    console.log('Début inscription EMAIL...');
    
    try {
      // Note: Ne vérifions pas dans profiles car l'email n'y est pas stocké
      // Le check se fera directement via auth.signUp qui retournera une erreur si l'email existe
      
      // Déconnecter d'abord pour éviter les conflits
      // Note: Ne vérifions pas dans profiles car l'email n'y est pas stocké
      // Le check se fera directement via auth.signUp qui retournera une erreur si l'email existe
      
      // Déconnecter d'abord pour éviter les conflits
      const { data: session } = await supabase.auth.getSession();
      if (session?.session) {
        console.log('Déconnexion session existante pour inscription EMAIL');
        await supabase.auth.signOut();
        // Attendre que la déconnexion soit effective
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Étape 1: Créer le compte utilisateur
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
            role: formData.role,
            auth_mode: 'email' // Différencier de 'sms'
          }
        }
      });

      if (error) {
        // Gérer spécifiquement le rate limit
        if (error.status === 429) {
          const match = error.message.match(/(\d+) seconds/);
          const seconds = match ? match[1] : '60';
          throw new Error(`Trop de tentatives. Réessayez dans ${seconds} secondes.`);
        }
        
        // Gérer l'erreur "User already registered"
        if (error.message?.includes('already registered') || error.message?.includes('already been registered')) {
          throw new Error('Ce compte existe déjà. Veuillez vous connecter.');
        }
        
        throw error;
      }
      console.log('Compte EMAIL créé avec succès');

      if (data.user) {
        // Étape 2: Attendre et mettre à jour le profil correctement
        try {
          // Attendre un peu pour que le trigger de création de profil se termine
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
              id: data.user.id,
              full_name: formData.fullName,
              email: formData.email,
              phone: formData.phone || null,
              role: formData.role,
              company_name: formData.role === 'vendor' ? formData.companyName || null : null,
              vehicle_info: formData.role === 'delivery' ? formData.vehicleInfo || null : null,
              wallet_type: formData.role === 'vendor' ? formData.walletType || null : null
            }, { onConflict: 'id' });
          
          console.log('Profil mis à jour avec le rôle:', formData.role);

          // Rediriger vers le bon dashboard selon le rôle
          const redirectPath = formData.role === 'vendor' ? '/vendor' : 
                             formData.role === 'delivery' ? '/delivery' : '/buyer';
          
          toast({
            title: "Compte créé !",
            description: "Redirection en cours...",
          });

          // Attendre un peu avant la redirection pour s'assurer que le profil est bien mis à jour
          setTimeout(() => {
            navigate(redirectPath, { replace: true });
          }, 500);

        } catch (profileUpdateError) {
          console.error('Erreur lors de la mise à jour du profil:', profileUpdateError);
          toast({
            title: "Compte créé mais erreur de profil",
            description: "Votre compte a été créé mais il y a eu une erreur lors de la configuration du profil. Veuillez vous reconnecter.",
            variant: "destructive",
          });
        }
      }
    } catch (error: unknown) {
      console.error('Erreur inscription:', error);
      const errorMessage = toFrenchErrorMessage(error, "Erreur d'inscription inconnue");
      toast({
        title: "Erreur lors de l'inscription",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (!formData.email || !formData.password) {
      toast({
        title: "Erreur",
        description: "Veuillez saisir votre email et mot de passe",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    console.log('Début connexion...');
    
    try {
      // D'abord, déconnecter toute session existante (notamment SMS) pour éviter les conflits
      await supabase.auth.signOut();
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (error) throw error;
      console.log('Connexion réussie');

      if (data.user) {
        toast({
          title: "Connexion réussie !",
          description: "Chargement de votre profil...",
        });

        // Récupérer le rôle de l'utilisateur pour rediriger correctement
        try {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', data.user.id)
            .single();

          if (profileError) {
            console.error('Erreur lors de la récupération du profil:', profileError);
            // Rediriger vers buyer par défaut en cas d'erreur
            navigate('/buyer', { replace: true });
          } else if (profile?.role) {
            // Rediriger vers le bon dashboard selon le rôle
            const redirectPath = profile.role === 'vendor' ? '/vendor' : 
                               profile.role === 'delivery' ? '/delivery' : '/buyer';
            navigate(redirectPath, { replace: true });
          } else {
            // Aucun rôle trouvé, rediriger vers buyer par défaut
            navigate('/buyer', { replace: true });
          }
        } catch (profileFetchError) {
          console.error('Erreur lors de la récupération du profil:', profileFetchError);
          navigate('/buyer', { replace: true });
        }
      }
    } catch (error: unknown) {
      console.error('Erreur connexion:', error);
      const errorMessage = toFrenchErrorMessage(error, 'Erreur de connexion inconnue');
      toast({
        title: "Erreur de connexion",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {isLogin && (
        <p className="text-sm text-muted-foreground text-center mb-4">
          Utilisez vos identifiants pour vous connecter
        </p>
      )}
      {!isLogin && (
        <p className="text-sm text-muted-foreground text-center mb-4">
          Créez votre compte en quelques étapes
        </p>
      )}
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => handleInputChange('email', e.target.value)}
          placeholder="votre@email.com"
          disabled={loading}
        />
      </div>

      <PasswordInput
        value={formData.password}
        onChange={(value) => handleInputChange('password', value)}
        disabled={loading}
      />

      {!isLogin && (
        <>
          <div>
            <Label htmlFor="fullName">Nom complet *</Label>
            <Input
              id="fullName"
              value={formData.fullName}
              onChange={(e) => handleInputChange('fullName', e.target.value)}
              placeholder="Votre nom complet"
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="phone">Téléphone</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              placeholder="+221 XX XXX XX XX"
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="role">Type de compte</Label>
            <Select 
              value={formData.role} 
              onValueChange={(value) => handleInputChange('role', value)}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="buyer">Client</SelectItem>
                <SelectItem value="vendor">Vendeur(se)</SelectItem>
                <SelectItem value="delivery">Livreur</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <RoleSpecificFields
            role={formData.role}
            companyName={formData.companyName}
            vehicleInfo={formData.vehicleInfo}
            walletType={formData.walletType}
            onCompanyNameChange={(value) => handleInputChange('companyName', value)}
            onVehicleInfoChange={(value) => handleInputChange('vehicleInfo', value)}
            onWalletTypeChange={(value) => handleInputChange('walletType', value)}
            disabled={loading}
          />
          {formData.role === 'vendor' && (
            <div>
              <Label htmlFor="address">Adresse de la boutique *</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                placeholder="Adresse de la boutique"
                disabled={loading}
                required
              />
            </div>
          )}
        </>
      )}

      <Button 
        onClick={isLogin ? handleSignIn : handleSignUp}
        className="w-full"
        disabled={loading}
      >
        {loading ? (
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            <span>{isLogin ? 'Connexion...' : 'Inscription...'}</span>
          </div>
        ) : (
          isLogin ? 'Se connecter' : 'Créer le compte'
        )}
      </Button>

      <div className="text-center">
        <button
          type="button"
          onClick={onToggleMode}
          className="text-blue-600 hover:underline text-sm disabled:opacity-50"
          disabled={loading}
        >
          {isLogin ? "Pas encore de compte ? S'inscrire" : 'Déjà un compte ? Se connecter'}
        </button>
      </div>
    </div>
  );
};

export default AuthForm;
