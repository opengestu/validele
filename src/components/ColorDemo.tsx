import React from 'react';
import { Shield, Package, Search, Truck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const ColorDemo = () => {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-12">
        
        {/* En-tête de démonstration */}
        <div className="text-center">
          <h1 className="text-4xl font-bold font-heading mb-4">
            🎨 Démonstration Palette Validèl
          </h1>
          <p className="text-lg text-muted-foreground">
            Nouvelle identité visuelle avec couleurs par rôle utilisateur
          </p>
        </div>

        {/* Couleurs principales */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="text-center p-6">
            <div className="h-16 bg-primary rounded-lg mb-4"></div>
            <h3 className="font-semibold">Primary</h3>
            <p className="text-sm text-muted-foreground">Vert sécurité</p>
          </Card>
          
          <Card className="text-center p-6">
            <div className="h-16 bg-secondary rounded-lg mb-4"></div>
            <h3 className="font-semibold">Secondary</h3>
            <p className="text-sm text-muted-foreground">Bleu confiance</p>
          </Card>
          
          <Card className="text-center p-6">
            <div className="h-16 bg-accent rounded-lg mb-4"></div>
            <h3 className="font-semibold">Accent</h3>
            <p className="text-sm text-muted-foreground">Bleu accent</p>
          </Card>
          
          <Card className="text-center p-6">
            <div className="h-16 bg-destructive rounded-lg mb-4"></div>
            <h3 className="font-semibold">Destructive</h3>
            <p className="text-sm text-muted-foreground">Rouge erreur</p>
          </Card>
        </div>

        {/* Couleurs par rôle */}
        <div>
          <h2 className="text-2xl font-bold font-heading mb-6">Couleurs par Rôle Utilisateur</h2>
          <div className="grid md:grid-cols-3 gap-6">
            
            {/* Vendeur */}
            <Card className="card-vendor p-6">
              <div className="flex items-center gap-3 mb-4">
                <Package className="h-8 w-8 text-validel-vendor" />
                <h3 className="text-xl font-semibold">Vendeur</h3>
              </div>
              <div className="space-y-3">
                <Button className="btn-vendor w-full">
                  Gérer mes produits
                </Button>
                <div className="h-8 bg-validel-vendor rounded"></div>
                <p className="text-sm text-muted-foreground">Orange énergique</p>
              </div>
            </Card>

            {/* Acheteur */}
            <Card className="card-buyer p-6">
              <div className="flex items-center gap-3 mb-4">
                <Search className="h-8 w-8 text-validel-buyer" />
                <h3 className="text-xl font-semibold">Acheteur</h3>
              </div>
              <div className="space-y-3">
                <Button className="btn-buyer w-full">
                  Rechercher produits
                </Button>
                <div className="h-8 bg-validel-buyer rounded"></div>
                <p className="text-sm text-muted-foreground">Vert sécurité</p>
              </div>
            </Card>

            {/* Livreur */}
            <Card className="card-delivery p-6">
              <div className="flex items-center gap-3 mb-4">
                <Truck className="h-8 w-8 text-validel-delivery" />
                <h3 className="text-xl font-semibold">Livreur</h3>
              </div>
              <div className="space-y-3">
                <Button className="btn-delivery w-full">
                  Scanner QR Code
                </Button>
                <div className="h-8 bg-validel-delivery rounded"></div>
                <p className="text-sm text-muted-foreground">Violet dynamique</p>
              </div>
            </Card>
          </div>
        </div>

        {/* Gradients */}
        <div>
          <h2 className="text-2xl font-bold font-heading mb-6">Gradients Personnalisés</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="h-24 bg-validel-gradient rounded-lg flex items-center justify-center text-white font-semibold">
              Validèl
            </div>
            <div className="h-24 bg-validel-vendor-gradient rounded-lg flex items-center justify-center text-white font-semibold">
              Vendeur
            </div>
            <div className="h-24 bg-validel-buyer-gradient rounded-lg flex items-center justify-center text-white font-semibold">
              Acheteur
            </div>
            <div className="h-24 bg-validel-delivery-gradient rounded-lg flex items-center justify-center text-white font-semibold">
              Livreur
            </div>
          </div>
        </div>

        {/* Status badges */}
        <div>
          <h2 className="text-2xl font-bold font-heading mb-6">Badges de Statut</h2>
          <div className="flex flex-wrap gap-3">
            <span className="status-success px-3 py-1 rounded-full text-sm font-medium">
              Succès
            </span>
            <span className="status-warning px-3 py-1 rounded-full text-sm font-medium">
              Attention
            </span>
            <span className="status-error px-3 py-1 rounded-full text-sm font-medium">
              Erreur
            </span>
            <span className="status-info px-3 py-1 rounded-full text-sm font-medium">
              Information
            </span>
          </div>
        </div>

        {/* Animations */}
        <div>
          <h2 className="text-2xl font-bold font-heading mb-6">Animations</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="p-6 animate-fade-in">
              <h3 className="font-semibold mb-2">Fade In</h3>
              <p className="text-sm text-muted-foreground">Animation d'apparition</p>
            </Card>
            <Card className="p-6 animate-slide-up">
              <h3 className="font-semibold mb-2">Slide Up</h3>
              <p className="text-sm text-muted-foreground">Animation de glissement</p>
            </Card>
            <Card className="p-6">
              <div className="animate-bounce-gentle inline-block">
                <Shield className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-semibold mb-2 mt-3">Bounce Gentle</h3>
              <p className="text-sm text-muted-foreground">Rebond subtil</p>
            </Card>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ColorDemo;