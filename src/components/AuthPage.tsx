import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Phone, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import validelLogo from '@/assets/validel-logo.png';
import PhoneAuthForm from './auth/PhoneAuthForm';
import AuthForm from './auth/AuthForm';

const AuthPage = () => {
  const [authMethod, setAuthMethod] = useState<'phone' | 'email'>('phone');
  const [isLogin, setIsLogin] = useState(true);
  
  const navigate = useNavigate();
  const { user, userProfile, loading: authLoading } = useAuth();

  React.useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    
    // Ne rediriger que si l'utilisateur a un profil COMPLET
    if (!userProfile || !userProfile.full_name) {
      // L'utilisateur est connecté mais n'a pas complété son profil
      // Ne pas rediriger, le laisser sur la page d'authentification
      console.log('Utilisateur connecté mais profil incomplet');
      return;
    }

    const redirectPath = userProfile.role === 'vendor' ? '/vendor' : 
                         userProfile.role === 'delivery' ? '/delivery' : '/buyer';
    navigate(redirectPath, { replace: true });
  }, [authLoading, navigate, user, userProfile]);

  return (
    <div className="relative min-h-[100svh] text-foreground">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/auth-bg.webp)" }}
      />
      {/* Readability overlay */}
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />

      <header className="sticky top-0 z-20 border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-md px-4">
          <div className="flex h-16 items-center justify-center gap-3">
            <img src={validelLogo} alt="Validèl" className="h-8 w-8 object-contain" />
            <h1 className="text-xl font-semibold tracking-tight">Validèl</h1>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-md px-4 py-8">
        <Card className="bg-background/75 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <CardHeader className="pb-4">
            <CardTitle className="text-center text-xl">
              {isLogin ? 'Connexion' : 'Inscription'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={authMethod} onValueChange={(v) => setAuthMethod(v as 'phone' | 'email')} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="phone" className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  <span>Téléphone</span>
                </TabsTrigger>
                <TabsTrigger value="email" className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  <span>Email</span>
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="phone" className="mt-0">
                <PhoneAuthForm onSwitchToEmail={() => setAuthMethod('email')} />
              </TabsContent>
              
              <TabsContent value="email" className="mt-0">
                <AuthForm isLogin={isLogin} onToggleMode={() => setIsLogin(!isLogin)} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Informations supplémentaires */}
        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>
            En vous connectant, vous acceptez nos{' '}
            <Link to="/terms" className="text-primary hover:underline">
              conditions d'utilisation
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
