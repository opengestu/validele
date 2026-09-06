import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CreditCard, QrCode, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const ONBOARDING_STORAGE_KEY = "validele:onboarding_seen_v1";

const SLIDES = [
  {
    icon: ShieldCheck,
    title: "Paiement sécurisé par séquestre",
    description:
      "Le client paie via Wave ou Orange Money. L'argent est gardé sur Validèl jusqu'à la confirmation de livraison.",
  },
  {
    icon: QrCode,
    title: "Commandez avec un simple code",
    description:
      "Le vendeur génère un code produit. Le client l'entre dans l'application pour voir le produit, commander et payer en toute confiance.",
  },
  {
    icon: CreditCard,
    title: "Livraison validée par QR Code",
    description:
      "Le livreur récupère la commande avec un QR Code, puis la valide chez le client par scan pour libérer le paiement au vendeur.",
  },
] as const;

export default function HomePage() {
  const navigate = useNavigate();
  const { user, userProfile, loading: authLoading } = useAuth();
  const [api, setApi] = React.useState<CarouselApi>();
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const lastIndex = SLIDES.length - 1;
  const isLastSlide = currentIndex === lastIndex;

  const onboardingSeen = React.useMemo(() => {
    try {
      return localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }, []);

  React.useEffect(() => {
    // Si connecté, ne jamais renvoyer vers /auth depuis la home
    if (!authLoading && user) {
      const redirectPath = userProfile?.role === "vendor" ? "/vendor" :
        userProfile?.role === "delivery" ? "/delivery" : "/buyer";
      navigate(redirectPath, { replace: true });
      return;
    }

    if (onboardingSeen) {
      navigate("/auth", { replace: true });
    }
  }, [authLoading, navigate, onboardingSeen, user, userProfile?.role]);

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

  // Le splash HTML global couvre le chargement initial, on évite un 2e loader React.
  if (user || onboardingSeen) {
    return null;
  }

  const handleContinue = () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    navigate("/auth", { replace: true });
  };

  const handlePrimaryAction = () => {
    if (isLastSlide) {
      handleContinue();
      return;
    }
    api?.scrollTo(currentIndex + 1);
  };

  return (
    <div className="relative flex min-h-[100svh] flex-col overflow-hidden bg-background text-foreground">
      {/* En-tête : lien "Passer" */}
      <header className="relative z-20 flex items-center justify-end px-6 pt-[calc(env(safe-area-inset-top,0px)+1.25rem)]">
        <button
          type="button"
          onClick={handleContinue}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Passer
        </button>
      </header>

      {/* Carrousel d'onboarding */}
      <Carousel
        setApi={setApi}
        opts={{ loop: false, align: "start" }}
        className="flex-1"
      >
        <CarouselContent className="h-full">
          {SLIDES.map((slide, index) => {
            const Icon = slide.icon;
            const isActive = index === currentIndex;
            return (
              <CarouselItem key={index}>
                <div className="flex min-h-[60svh] w-full flex-col items-center justify-center px-8 text-center">
                  <div
                    className={cn(
                      "mb-9 flex h-20 w-20 items-center justify-center rounded-[1.5rem] bg-primary text-primary-foreground shadow-premium",
                      "transition-all duration-500",
                      isActive ? "scale-100 opacity-100" : "scale-90 opacity-70"
                    )}
                  >
                    <Icon className="h-9 w-9" strokeWidth={1.75} />
                  </div>

                  <h1
                    className={cn(
                      "font-heading text-[1.7rem] font-bold leading-tight tracking-tight text-foreground",
                      "transition-all duration-500",
                      isActive ? "translate-y-0 opacity-100" : "translate-y-1 opacity-80"
                    )}
                  >
                    {slide.title}
                  </h1>

                  <p
                    className={cn(
                      "mx-auto mt-4 max-w-sm text-[0.95rem] leading-relaxed text-muted-foreground",
                      "transition-all duration-500",
                      isActive ? "translate-y-0 opacity-100" : "translate-y-1 opacity-80"
                    )}
                  >
                    {slide.description}
                  </p>
                </div>
              </CarouselItem>
            );
          })}
        </CarouselContent>
      </Carousel>

      {/* Pied : indicateurs + rappel paiement + CTA */}
      <div className="relative z-20 px-6 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
        <div className="mb-6 flex items-center justify-center gap-2">
          {SLIDES.map((_, index) => {
            const isActive = index === currentIndex;
            return (
              <button
                key={index}
                type="button"
                aria-label={`Aller à l'étape ${index + 1}`}
                onClick={() => api?.scrollTo(index)}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  isActive ? "w-7 bg-primary" : "w-2 bg-border hover:bg-muted-foreground/40"
                )}
              />
            );
          })}
        </div>

        <p className="mb-4 text-center text-xs text-muted-foreground">
          Paiement via Wave · Orange Money
        </p>

        <Button
          onClick={handlePrimaryAction}
          className="h-12 w-full rounded-2xl bg-primary text-base font-medium text-primary-foreground shadow-premium transition-transform hover:bg-primary/90 active:scale-[0.99] motion-reduce:transition-none"
        >
          {isLastSlide ? "Continuer" : "Suivant"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
