import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CreditCard, QrCode, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import validelLogo from "@/assets/validel-logo.png";

const ONBOARDING_STORAGE_KEY = "validele:onboarding_seen_v1";

const SLIDES = [
  {
    icon: ShieldCheck,
    title: "Bienvenue sur Validèl",
    description:
      "Sécurisez vos transactions avec validation QR Code et paiement sous séquestre.",
  },
  {
    icon: QrCode,
    title: "Validez en un scan",
    description:
      "Scannez le QR Code pour confirmer la commande et suivre la livraison en temps réel.",
  },
  {
    icon: CreditCard,
    title: "Payez en toute confiance",
    description:
      "Wave ou Orange Money : le paiement est simple et protégé jusqu'à la validation.",
  },
] as const;

export default function HomePage() {
  const navigate = useNavigate();
  const { user, userProfile, loading: authLoading } = useAuth();
  const [api, setApi] = React.useState<CarouselApi>();
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const lastIndex = SLIDES.length - 1;

  React.useEffect(() => {
    // Si connecté, ne jamais renvoyer vers /auth depuis la home
    if (!authLoading && user) {
      const redirectPath = userProfile?.role === "vendor" ? "/vendor" :
        userProfile?.role === "delivery" ? "/delivery" : "/buyer";
      navigate(redirectPath, { replace: true });
      return;
    }

    const seen = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (seen === "1") {
      navigate("/auth", { replace: true });
    }
  }, [authLoading, navigate, user, userProfile?.role]);

  React.useEffect(() => {
    if (!api) return;

    const update = () => setCurrentIndex(api.selectedScrollSnap());
    update();
    api.on("select", update);
    api.on("reInit", update);

    return () => {
      api.off("select", update);
      api.off("reInit", update);
    };
  }, [api]);

  const handleContinue = () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    navigate("/auth", { replace: true });
  };

  return (
    <div className="relative min-h-[100svh] overflow-hidden bg-gradient-to-b from-background via-background to-muted/30 text-foreground">
      {/* Fond animé selon la slide active */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 transition-colors duration-700",
          currentIndex === 0 && "bg-gradient-to-b from-primary/10 via-background to-background",
          currentIndex === 1 &&
            "bg-gradient-to-b from-secondary/10 via-background to-background",
          currentIndex === 2 &&
            "bg-gradient-to-b from-primary/5 via-background to-secondary/10"
        )}
      />

      {/* Décor léger (ne change pas le parcours) */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl motion-reduce:animate-none animate-pulse" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-secondary/10 blur-3xl motion-reduce:animate-none animate-pulse" />

      <Carousel
        setApi={setApi}
        opts={{ loop: false, align: "start" }}
        className="h-[100svh]"
      >
        <CarouselContent className="h-[100svh]">
          {SLIDES.map((slide, index) => {
            const Icon = slide.icon;
            const isActive = index === currentIndex;
            return (
              <CarouselItem key={index} className="h-[100svh]">
                <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
                  <Card
                    className={cn(
                      "w-full max-w-md border bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60",
                      "transition-all duration-500",
                      isActive
                        ? "opacity-100 translate-y-0 scale-100"
                        : "opacity-70 translate-y-1 scale-[0.98]"
                    )}
                  >
                    <CardContent className="p-8 text-center">
                      {/* Logo Validel */}
                      <img 
                        src={validelLogo} 
                        alt="Validèl" 
                        className={cn(
                          "mx-auto mb-6 h-24 w-24 object-contain drop-shadow-lg",
                          "transition-transform duration-500",
                          isActive ? "scale-100" : "scale-90"
                        )}
                      />
                      <div
                        className={cn(
                          "mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl",
                          "bg-primary/10 text-primary",
                          "transition-transform duration-500",
                          isActive ? "scale-100 rotate-0" : "scale-95 -rotate-3"
                        )}
                      >
                        <Icon className="h-8 w-8" />
                      </div>

                      <h1
                        className={cn(
                          "text-3xl font-bold tracking-tight",
                          "transition-all duration-500",
                          isActive
                            ? "opacity-100 translate-y-0"
                            : "opacity-80 translate-y-1"
                        )}
                      >
                        {slide.title}
                      </h1>
                      <p
                        className={cn(
                          "mt-3 text-base text-muted-foreground",
                          "transition-all duration-500",
                          isActive
                            ? "opacity-100 translate-y-0"
                            : "opacity-80 translate-y-1"
                        )}
                      >
                        {slide.description}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Bouton seulement sur la 3ème (dernière) slide */}
                  {index === lastIndex && (
                    <div className="absolute bottom-6 right-6">
                      <Button
                        onClick={handleContinue}
                        className="gap-2 transition-transform motion-reduce:transition-none hover:translate-y-[-1px] active:translate-y-0"
                      >
                        Continuer
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CarouselItem>
            );
          })}
        </CarouselContent>
      </Carousel>

      {/* Indicateurs (animation + feedback visuel) */}
      <div className="fixed bottom-6 left-1/2 z-20 -translate-x-1/2">
        <div className="flex items-center gap-2 rounded-full border bg-background/70 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          {SLIDES.map((_, index) => {
            const isActive = index === currentIndex;
            return (
              <button
                key={index}
                type="button"
                aria-label={`Aller à l'étape ${index + 1}`}
                onClick={() => api?.scrollTo(index)}
                className={cn(
                  "h-2.5 rounded-full transition-all duration-300",
                  isActive
                    ? "w-7 bg-primary"
                    : "w-2.5 bg-muted-foreground/30 hover:bg-muted-foreground/45"
                )}
              />
            );
          })}
        </div>
      </div>

    </div>
  );
}