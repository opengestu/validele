import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Package, Search, Truck, QrCode, LogIn, CreditCard, Star, Users, CheckCircle, ArrowRight, Zap, Lock, Award } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
export default function HomePage() {
  const [isVisible, setIsVisible] = useState(false);
  const [currentTestimonial, setCurrentTestimonial] = useState(0);

  useEffect(() => {
    setIsVisible(true);
    const testimonialInterval = setInterval(() => {
      setCurrentTestimonial(prev => (prev + 1) % 3); // testimonials.length = 3
    }, 4000);
    return () => clearInterval(testimonialInterval);
  }, []);

  const userTypes = [{
    title: "Vendeur",
    description: "Enregistrez vos produits et gérez vos ventes en toute sécurité",
    icon: Package,
    link: "/vendor",
    color: "bg-validel-vendor hover:bg-validel-vendor/90",
    gradient: "bg-validel-vendor-gradient",
    features: ["Gestion des stocks", "Suivi des ventes", "Paiements garantis"],
    stats: "2.5k+ vendeurs"
  }, {
    title: "Acheteur", 
    description: "Recherchez et achetez en toute sécurité avec notre système de validation",
    icon: Search,
    link: "/buyer", 
    color: "bg-validel-buyer hover:bg-validel-buyer/90",
    gradient: "bg-validel-buyer-gradient",
    features: ["Produits vérifiés", "Paiement sécurisé", "Livraison garantie"],
    stats: "10k+ acheteurs"
  }, {
    title: "Livreur",
    description: "Validez les livraisons avec QR Code et augmentez vos revenus",
    icon: Truck,
    link: "/delivery",
    color: "bg-validel-delivery hover:bg-validel-delivery/90",
    gradient: "bg-validel-delivery-gradient",
    features: ["QR Code simple", "Paiement instantané", "Zones flexibles"],
    stats: "500+ livreurs"
  }];

  const features = [{
    icon: Shield,
    title: "Paiement ultra-sécurisé",
    description: "Fonds bloqués en séquestre jusqu'à validation complète de la livraison",
    color: "text-green-600"
  }, {
    icon: QrCode,
    title: "Validation QR Code",
    description: "Système de confirmation automatique par scan QR unique et crypté",
    color: "text-blue-600"
  }, {
    icon: Zap,
    title: "Instantané",
    description: "Libération des fonds en temps réel dès validation du QR Code",
    color: "text-purple-600"
  }, {
    icon: Lock,
    title: "Données chiffrées",
    description: "Chiffrement de bout en bout de toutes les transactions sensibles",
    color: "text-red-600"
  }, {
    icon: Award,
    title: "Confiance vérifiée",
    description: "Système de notation et avis vérifiés pour tous les utilisateurs",
    color: "text-yellow-600"
  }, {
    icon: CreditCard,
    title: "Multi-paiements",
    description: "Wave, Orange Money et autres moyens de paiement locaux",
    color: "text-indigo-600"
  }];

  const testimonials = [{
    name: "Fatou Diallo",
    role: "Commerçante à Dakar",
    content: "Validèl a transformé ma boutique ! Plus de problèmes de paiement, tout est automatisé et sécurisé.",
    rating: 5
  }, {
    name: "Moussa Sow",
    role: "Livreur indépendant",
    content: "Grâce au système QR, mes livraisons sont validées instantanément. Plus de litiges !",
    rating: 5
  }, {
    name: "Aminata Ba",
    role: "Cliente régulière",
    content: "Je fais confiance à Validèl pour tous mes achats en ligne. Sécurité garantie !",
    rating: 5
  }];

  const stats = [{
    number: "15k+",
    label: "Utilisateurs actifs"
  }, {
    number: "50k+",
    label: "Transactions sécurisées"
  }, {
    number: "99.9%",
    label: "Taux de satisfaction"
  }, {
    number: "24/7",
    label: "Support disponible"
  }];
  return <div className="min-h-screen overflow-x-hidden">
      {/* Header Amélioré */}
      <header className="bg-white/95 backdrop-blur-md shadow-lg border-b border-gray-100 sticky top-0 z-50 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 group">
              <div className="p-2 bg-gradient-to-br from-primary to-secondary rounded-xl shadow-lg group-hover:shadow-xl transition-all duration-300">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 font-heading">Validèl</h1>
                <p className="text-xs text-primary font-medium">Sécurité • Innovation</p>
              </div>
            </div>
            <div className="flex items-center space-x-8">
              <nav className="hidden md:flex space-x-8">
                <a href="#features" className="text-gray-600 hover:text-primary transition-all duration-300 font-medium relative group">
                  Fonctionnalités
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full"></span>
                </a>
                <a href="#testimonials" className="text-gray-600 hover:text-primary transition-all duration-300 font-medium relative group">
                  Témoignages
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full"></span>
                </a>
                <a href="#security" className="text-gray-600 hover:text-primary transition-all duration-300 font-medium relative group">
                  Sécurité
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full"></span>
                </a>
              </nav>
              <Link to="/auth">
                <Button className="bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 shadow-lg hover:shadow-xl transition-all duration-300 px-6 py-2.5 rounded-xl">
                  <LogIn className="h-4 w-4 mr-2" />
                  Se connecter
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section Modernisé */}
      <section className="relative py-24 px-6 bg-gradient-to-br from-slate-50 via-white to-primary/5 overflow-hidden">
        {/* Éléments décoratifs en arrière-plan */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl animate-bounce-gentle"></div>
          <div className="absolute bottom-20 right-10 w-48 h-48 bg-secondary/10 rounded-full blur-3xl animate-bounce-gentle" style={{animationDelay: '1s'}}></div>
          <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-accent/5 rounded-full blur-3xl animate-bounce-gentle" style={{animationDelay: '2s'}}></div>
        </div>
        
        <div className="max-w-7xl mx-auto text-center relative">
          {/* Titre principal avec animation */}
          <div className={`transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <h2 className="text-5xl md:text-7xl font-bold text-gray-900 mb-8 font-heading leading-tight">
              Révolutionnez vos
              <span className="block bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent animate-fade-in">
                transactions sécurisées
              </span>
            </h2>
            <p className="text-xl md:text-2xl text-gray-600 mb-6 max-w-4xl mx-auto leading-relaxed">
              La première plateforme sénégalaise de validation QR Code avec paiement sous séquestre.
            </p>
            <p className="text-lg text-gray-500 mb-12 max-w-2xl mx-auto">
              Zéro risque • Paiement instantané • Confiance garantie
            </p>
          </div>

          {/* Statistiques Impressionnantes */}
          <div className={`grid grid-cols-2 md:grid-cols-4 gap-6 mb-16 transition-all duration-1000 delay-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-primary mb-2">{stat.number}</div>
                <div className="text-sm text-gray-600 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
          
          {/* User Type Cards Améliorées */}
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {userTypes.map((type, index) => 
              <Card key={index} className={`card-elevated border-0 overflow-hidden group hover:scale-105 transition-all duration-500 cursor-pointer ${isVisible ? 'animate-slide-up' : 'opacity-0'}`} style={{animationDelay: `${index * 150}ms`}}>
                <div className={`h-1 ${type.gradient}`}></div>
                <CardContent className="p-8 text-center bg-gradient-to-br from-white to-gray-50/30 relative">
                  {/* Badge statistique */}
                  <div className="absolute -top-3 right-4 bg-white px-3 py-1 rounded-full text-xs font-semibold text-gray-600 shadow-md">
                    {type.stats}
                  </div>
                  
                  <div className="mb-6 p-6 rounded-2xl bg-gradient-to-br from-white to-gray-50 shadow-lg inline-block group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                    <type.icon className="h-12 w-12 text-gray-700 group-hover:text-primary transition-colors duration-300" />
                  </div>
                  <h3 className="text-2xl font-bold mb-3 font-heading text-gray-900">{type.title}</h3>
                  <p className="text-gray-600 mb-6 leading-relaxed">{type.description}</p>
                  
                  {/* Liste des fonctionnalités */}
                  <ul className="text-sm text-gray-500 mb-6 space-y-2">
                    {type.features.map((feature, i) => (
                      <li key={i} className="flex items-center justify-center">
                        <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  
                  <Link to="/auth">
                    <Button className={`${type.color} text-white px-8 py-3 rounded-xl font-semibold shadow-lg hover:shadow-2xl transition-all duration-300 group-hover:translate-y-1`}>
                      Commencer maintenant
                      <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform duration-300" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>

          {/* CTA Section */}
          <div className="text-center">
            <div className="mb-8">
              <Link to="/search">
                <Button variant="outline" size="lg" className="mr-4 border-2 border-primary text-primary hover:bg-primary hover:text-white px-8 py-4 rounded-xl font-semibold transition-all duration-300">
                  <Search className="h-5 w-5 mr-2" />
                  Explorer les produits
                </Button>
              </Link>
              <Link to="/auth">
                <Button size="lg" className="bg-gradient-to-r from-secondary to-accent hover:from-secondary/90 hover:to-accent/90 px-8 py-4 rounded-xl font-semibold shadow-xl hover:shadow-2xl transition-all duration-300">
                  Rejoindre Validèl
                  <Users className="h-5 w-5 ml-2" />
                </Button>
              </Link>
            </div>
            <p className="text-sm text-gray-500">🎉 Inscription gratuite • Sans engagement</p>
          </div>
        </div>
      </section>

      {/* Features Section Optimisée */}
      <section id="features" className="py-16 bg-gradient-to-b from-white to-gray-50/50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h3 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 font-heading">
              Pourquoi choisir 
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"> Validèl</span> ?
            </h3>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Une technologie de pointe au service de votre sécurité
            </p>
          </div>
          
          {/* Grille compacte et élégante */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="group border-0 shadow-md hover:shadow-xl transition-all duration-300 bg-white/80 backdrop-blur-sm">
                <CardContent className="p-6">
                  {/* Icône compacte */}
                  <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br from-gray-50 to-white shadow-sm mb-4 group-hover:scale-110 transition-transform duration-300 ${feature.color}`}>
                    <feature.icon className="h-6 w-6" />
                  </div>
                  
                  {/* Contenu */}
                  <h4 className="text-lg font-bold mb-2 text-gray-900 font-heading">{feature.title}</h4>
                  <p className="text-sm text-gray-600 leading-relaxed mb-4">{feature.description}</p>
                  
                  {/* Badge de validation discret */}
                  <div className="flex items-center text-xs text-gray-500">
                    <CheckCircle className="h-3 w-3 text-green-500 mr-1" />
                    <span>Vérifiée</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          {/* CTA Section compacte */}
          <div className="text-center mt-12">
            <p className="text-sm text-gray-500 mb-4">Plus de 15 000 utilisateurs nous font confiance</p>
            <Link to="/auth">
              <Button className="bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 px-6 py-2 text-sm font-medium">
                Découvrir Validèl
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Section Témoignages avec Carrousel */}
      <section id="testimonials" className="py-24 bg-gradient-to-br from-primary/5 via-white to-secondary/5">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h3 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6 font-heading">
              Ils nous font 
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"> confiance</span>
            </h3>
            <p className="text-xl text-gray-600">Découvrez les témoignages de notre communauté</p>
          </div>
          
          {/* Carrousel de témoignages */}
          <div className="relative overflow-hidden">
            <div className="flex transition-transform duration-500 ease-in-out" style={{transform: `translateX(-${currentTestimonial * 100}%)`}}>
              {testimonials.map((testimonial, index) => (
                <div key={index} className="w-full flex-shrink-0 px-4">
                  <Card className="max-w-4xl mx-auto bg-white/80 backdrop-blur-sm border-0 shadow-2xl">
                    <CardContent className="p-12 text-center">
                      <div className="flex justify-center mb-6">
                        {[...Array(testimonial.rating)].map((_, i) => (
                          <Star key={i} className="h-6 w-6 text-yellow-400 fill-current" />
                        ))}
                      </div>
                      <blockquote className="text-2xl md:text-3xl text-gray-700 font-medium italic mb-8 leading-relaxed">
                        "{testimonial.content}"
                      </blockquote>
                      <div className="flex items-center justify-center space-x-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center text-white font-bold text-xl">
                          {testimonial.name.charAt(0)}
                        </div>
                        <div className="text-left">
                          <div className="font-semibold text-lg text-gray-900">{testimonial.name}</div>
                          <div className="text-gray-600">{testimonial.role}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
            
            {/* Indicateurs du carrousel */}
            <div className="flex justify-center mt-8 space-x-2">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  title={`Voir le témoignage ${index + 1}`}
                  className={`w-3 h-3 rounded-full transition-all duration-300 ${
                    currentTestimonial === index ? 'bg-primary scale-125' : 'bg-gray-300 hover:bg-gray-400'
                  }`}
                  onClick={() => setCurrentTestimonial(index)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Security Section Modernisée */}
      <section id="security" className="py-24 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h3 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6 font-heading">
              Sécurité 
              <span className="bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent"> militaire</span>
            </h3>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Notre infrastructure de sécurité garantit la protection absolue de vos données et transactions.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Chiffrement */}
            <Card className="bg-gradient-to-br from-red-50 to-orange-50 border-0 shadow-xl hover:shadow-2xl transition-all duration-300 group">
              <CardContent className="p-8 text-center">
                <div className="mb-6 p-4 bg-gradient-to-br from-red-100 to-orange-100 rounded-2xl inline-block group-hover:scale-110 transition-transform duration-300">
                  <Lock className="h-12 w-12 text-red-600" />
                </div>
                <h4 className="text-xl font-bold mb-4 text-gray-900">Chiffrement AES-256</h4>
                <p className="text-gray-600">Chiffrement de niveau bancaire pour toutes vos données sensibles.</p>
              </CardContent>
            </Card>
            
            {/* Blockchain */}
            <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-0 shadow-xl hover:shadow-2xl transition-all duration-300 group">
              <CardContent className="p-8 text-center">
                <div className="mb-6 p-4 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-2xl inline-block group-hover:scale-110 transition-transform duration-300">
                  <Shield className="h-12 w-12 text-blue-600" />
                </div>
                <h4 className="text-xl font-bold mb-4 text-gray-900">QR Code Crypté</h4>
                <p className="text-gray-600">Codes QR uniques et cryptés pour chaque transaction.</p>
              </CardContent>
            </Card>
            
            {/* Audit */}
            <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-0 shadow-xl hover:shadow-2xl transition-all duration-300 group md:col-span-2 lg:col-span-1">
              <CardContent className="p-8 text-center">
                <div className="mb-6 p-4 bg-gradient-to-br from-green-100 to-emerald-100 rounded-2xl inline-block group-hover:scale-110 transition-transform duration-300">
                  <Award className="h-12 w-12 text-green-600" />
                </div>
                <h4 className="text-xl font-bold mb-4 text-gray-900">Audits Réguliers</h4>
                <p className="text-gray-600">Audits de sécurité mensuels par des experts indépendants.</p>
              </CardContent>
            </Card>
          </div>
          
          {/* Certificats de sécurité */}
          <div className="mt-16 text-center">
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-4xl mx-auto">
              <h4 className="text-2xl font-bold mb-6 text-gray-900">Certifications & Conformité</h4>
              <div className="flex justify-center items-center space-x-8 flex-wrap gap-4">
                <div className="flex items-center space-x-2 text-gray-600">
                  <Shield className="h-6 w-6 text-green-600" />
                  <span className="font-medium">ISO 27001</span>
                </div>
                <div className="flex items-center space-x-2 text-gray-600">
                  <Lock className="h-6 w-6 text-blue-600" />
                  <span className="font-medium">PCI DSS</span>
                </div>
                <div className="flex items-center space-x-2 text-gray-600">
                  <Award className="h-6 w-6 text-purple-600" />
                  <span className="font-medium">RGPD Conforme</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Modernisé */}
      <footer className="bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            {/* Logo et description */}
            <div className="md:col-span-2">
              <div className="flex items-center space-x-3 mb-6">
                <div className="p-2 bg-gradient-to-br from-primary to-secondary rounded-xl">
                  <Shield className="h-6 w-6 text-white" />
                </div>
                <div>
                  <span className="text-2xl font-bold font-heading">Validèl</span>
                  <p className="text-xs text-primary">Sécurité • Innovation</p>
                </div>
              </div>
              <p className="text-gray-300 leading-relaxed mb-6 max-w-md">
                La première plateforme sénégalaise de validation QR Code avec paiement sous séquestre. 
                Sécurisez vos transactions en ligne en toute confiance.
              </p>
              <div className="flex space-x-4">
                <div className="bg-gray-800 p-3 rounded-xl hover:bg-gray-700 transition-colors cursor-pointer">
                  <Users className="h-5 w-5" />
                </div>
                <div className="bg-gray-800 p-3 rounded-xl hover:bg-gray-700 transition-colors cursor-pointer">
                  <Shield className="h-5 w-5" />
                </div>
                <div className="bg-gray-800 p-3 rounded-xl hover:bg-gray-700 transition-colors cursor-pointer">
                  <CreditCard className="h-5 w-5" />
                </div>
              </div>
            </div>
            
            {/* Liens rapides */}
            <div>
              <h4 className="text-lg font-semibold mb-4 text-white">Plateforme</h4>
              <ul className="space-y-3 text-gray-300">
                <li><Link to="/vendor" className="hover:text-primary transition-colors">Espace Vendeur</Link></li>
                <li><Link to="/buyer" className="hover:text-primary transition-colors">Espace Acheteur</Link></li>
                <li><Link to="/delivery" className="hover:text-primary transition-colors">Espace Livreur</Link></li>
                <li><Link to="/search" className="hover:text-primary transition-colors">Recherche</Link></li>
              </ul>
            </div>
            
            {/* Support */}
            <div>
              <h4 className="text-lg font-semibold mb-4 text-white">Support</h4>
              <ul className="space-y-3 text-gray-300">
                <li><a href="#" className="hover:text-primary transition-colors">Centre d'aide</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Sécurité</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Confidentialité</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Contact</a></li>
              </ul>
            </div>
          </div>
          
          {/* Ligne de séparation */}
          <div className="border-t border-gray-700 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center">
              <div className="text-gray-400 mb-4 md:mb-0">
                © 2025 Validèl. Tous droits réservés. Fait avec ❤️ au Sénégal.
              </div>
              <div className="flex items-center space-x-6 text-sm text-gray-400">
                <span>Version 2.0</span>
                <span>•</span>
                <span>API Status: ✅</span>
                <span>•</span>
                <span>Uptime: 99.9%</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>;
};