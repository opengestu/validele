
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import validelLogo from '@/assets/validel-logo.png';

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    phone: '',
    role: 'buyer' as 'buyer' | 'vendor' | 'delivery',
    companyName: '',
    vehicleInfo: ''
  });
  
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, userProfile, loading: authLoading } = useAuth();

  React.useEffect(() => {
    // Tant que l'utilisateur n'est pas déconnecté, ne pas afficher /auth
    if (authLoading) return;
    if (!user) return;

    const redirectPath = userProfile?.role === 'vendor' ? '/vendor' : 
                         userProfile?.role === 'delivery' ? '/delivery' : '/buyer';
    navigate(redirectPath, { replace: true });
  }, [authLoading, navigate, user, userProfile?.role]);

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
    try {
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
          },
          emailRedirectTo: `${window.location.origin}/`
        }
      });

      if (error) throw error;

      if (data.user) {
        // Mettre à jour le profil avec les informations supplémentaires
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            full_name: formData.fullName,
            phone: formData.phone,
            role: formData.role,
            company_name: formData.role === 'vendor' ? formData.companyName : null,
            vehicle_info: formData.role === 'delivery' ? formData.vehicleInfo : null
          })
          .eq('id', data.user.id);

        if (profileError) throw profileError;

        toast({
          title: "Compte créé avec succès",
          description: "Vous pouvez maintenant vous connecter",
        });
        
        // Rediriger selon le rôle
        const redirectPath = formData.role === 'vendor' ? '/vendor' : 
                           formData.role === 'delivery' ? '/delivery' : '/buyer';
        navigate(redirectPath, { replace: true });
      }
    } catch (error: any) {
      toast({
        title: "Erreur lors de l'inscription",
        description: error.message,
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
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (error) throw error;

      if (data.user) {
        // Récupérer le profil pour rediriger selon le rôle
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single();

        const redirectPath = profile?.role === 'vendor' ? '/vendor' : 
                           profile?.role === 'delivery' ? '/delivery' : '/buyer';
        navigate(redirectPath, { replace: true });
      }
    } catch (error: any) {
      toast({
        title: "Erreur de connexion",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[100svh] text-foreground">
      {/* Background image (place the file in public/auth-bg.webp) */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/auth-bg.webp)" }}
      />
      {/* Readability overlay */}
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />

      <header className="relative z-10 border-b bg-background/60 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center space-x-4">
            <Link to="/">
              <ArrowLeft className="h-6 w-6 text-muted-foreground hover:text-foreground transition-colors" />
            </Link>
            <div className="flex items-center space-x-2">
              <img src={validelLogo} alt="Validèl" className="h-10 w-10 object-contain" />
              <h1 className="text-2xl font-bold">Validèl</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-md px-4 py-8">
        <Card className="bg-background/75 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <CardHeader>
            <CardTitle className="text-center">
              {isLogin ? 'Connexion' : 'Créer un compte'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="votre@email.com"
              />
            </div>

            <div>
              <Label htmlFor="password">Mot de passe</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  placeholder="••••••••"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {!isLogin && (
              <>
                <div>
                  <Label htmlFor="fullName">Nom complet *</Label>
                  <Input
                    id="fullName"
                    value={formData.fullName}
                    onChange={(e) => handleInputChange('fullName', e.target.value)}
                    placeholder="Votre nom complet"
                  />
                </div>

                <div>
                  <Label htmlFor="phone">Téléphone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    placeholder="+221 XX XXX XX XX"
                  />
                </div>

                <div>
                  <Label htmlFor="role">Type de compte</Label>
                  <Select value={formData.role} onValueChange={(value) => handleInputChange('role', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buyer">Acheteur</SelectItem>
                      <SelectItem value="vendor">Vendeur</SelectItem>
                      <SelectItem value="delivery">Livreur</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.role === 'vendor' && (
                  <div>
                    <Label htmlFor="companyName">Nom de l'entreprise</Label>
                    <Input
                      id="companyName"
                      value={formData.companyName}
                      onChange={(e) => handleInputChange('companyName', e.target.value)}
                      placeholder="Nom de votre entreprise"
                    />
                  </div>
                )}

                {formData.role === 'delivery' && (
                  <div>
                    <Label htmlFor="vehicleInfo">Informations véhicule</Label>
                    <Input
                      id="vehicleInfo"
                      value={formData.vehicleInfo}
                      onChange={(e) => handleInputChange('vehicleInfo', e.target.value)}
                      placeholder="Type de véhicule, immatriculation..."
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
              {loading ? 'Chargement...' : (isLogin ? 'Se connecter' : 'Créer le compte')}
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-primary hover:underline text-sm"
              >
                {isLogin ? "Pas encore de compte ? S'inscrire" : 'Déjà un compte ? Se connecter'}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AuthPage;
