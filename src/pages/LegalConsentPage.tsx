import React from "react";
import type { CheckedState } from "@radix-ui/react-checkbox";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  LEGAL_BRAND_NAME,
  LEGAL_CONSENT_ROUTE,
  PRIVACY_POLICY_ROUTE,
  TERMS_OF_USE_ROUTE,
  hasAcceptedLegal,
  markLegalAccepted,
} from "@/lib/legalConsent";

type LegalRedirectState = {
  from?: string;
};

const isLegalRoute = (path: string): boolean => {
  return (
    path === LEGAL_CONSENT_ROUTE
    || path === PRIVACY_POLICY_ROUTE
    || path === TERMS_OF_USE_ROUTE
  );
};

const toBool = (value: CheckedState): boolean => value === true;

const LegalConsentPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const alreadyAccepted = React.useMemo(() => hasAcceptedLegal(), []);
  const [privacyChecked, setPrivacyChecked] = React.useState(false);
  const [termsChecked, setTermsChecked] = React.useState(false);

  if (alreadyAccepted) {
    return <Navigate to="/" replace />;
  }

  const rawState = (location.state ?? null) as LegalRedirectState | null;
  const fromPath =
    rawState?.from && !isLegalRoute(rawState.from) ? rawState.from : "/";
  const canContinue = privacyChecked && termsChecked;

  const handleAccept = (): void => {
    if (!canContinue) {
      return;
    }

    markLegalAccepted();
    navigate(fromPath, { replace: true });
  };

  return (
    <div className="min-h-[100svh] bg-[radial-gradient(90%_65%_at_10%_0%,#e0f2fe_0%,#f8fafc_55%,#f8fafc_100%)] text-foreground">
      <div className="mx-auto flex min-h-[100svh] w-full max-w-md flex-col px-4 pb-6 pt-5 sm:max-w-lg sm:px-6">
        <header className="rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-sm backdrop-blur">
          <p className="mb-3 inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Étape obligatoire
          </p>
          <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Confidentialité et conditions d'utilisation
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
            Avant de continuer, merci de lire et d'accepter les règles de confidentialité
            et les conditions d'utilisation de {LEGAL_BRAND_NAME}.
          </p>
        </header>

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Confirmation
          </p>

          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <Checkbox
                id="privacy-consent"
                checked={privacyChecked}
                onCheckedChange={(value) => setPrivacyChecked(toBool(value))}
                className="mt-0.5"
              />
              <Link
                to={PRIVACY_POLICY_ROUTE}
                className="text-sm leading-relaxed text-slate-800 underline decoration-slate-300 underline-offset-4 hover:text-slate-900"
              >
                J'ai lu et j'accepte les règles de confidentialité.
              </Link>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <Checkbox
                id="terms-consent"
                checked={termsChecked}
                onCheckedChange={(value) => setTermsChecked(toBool(value))}
                className="mt-0.5"
              />
              <Link
                to={TERMS_OF_USE_ROUTE}
                className="text-sm leading-relaxed text-slate-800 underline decoration-slate-300 underline-offset-4 hover:text-slate-900"
              >
                J'ai lu et j'accepte les conditions d'utilisation.
              </Link>
            </div>
          </div>
        </section>

        <div className="mt-auto pt-4">
          <div className="rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
            <Button
              onClick={handleAccept}
              disabled={!canContinue}
              className="h-11 w-full text-sm font-semibold"
            >
              Accepter et continuer
            </Button>
            <p className="mt-2 text-center text-[11px] text-slate-500">
              Cette étape est requise pour utiliser l'application.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LegalConsentPage;
