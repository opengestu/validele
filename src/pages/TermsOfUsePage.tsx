import React from "react";
import { ArrowLeft, Scale } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  LEGAL_BRAND_NAME,
  LEGAL_CONTACT_ADDRESS,
  LEGAL_CONTACT_EMAIL,
  LEGAL_CONTACT_PHONE,
  LEGAL_SUPPORT_WHATSAPP,
  LEGAL_CONSENT_ROUTE,
  LEGAL_VERSION,
  PRIVACY_POLICY_ROUTE,
} from "@/lib/legalConsent";

const TermsOfUsePage: React.FC = () => {
  return (
    <div className="min-h-[100svh] bg-slate-50 px-4 py-6 text-foreground sm:px-6 sm:py-8">
      <main className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="outline" className="gap-2">
            <Link to={LEGAL_CONSENT_ROUTE}>
              <ArrowLeft className="h-4 w-4" />
              Retour
            </Link>
          </Button>

          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-muted-foreground">
            Version: {LEGAL_VERSION}
          </span>
        </div>

        <header className="mb-8 border-b border-slate-200 pb-5">
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Scale className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Conditions d'utilisation
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Ces conditions définissent les règles d'utilisation de l'application
            {LEGAL_BRAND_NAME} pour tous les profils utilisateurs.
          </p>
        </header>

        <div className="space-y-7 text-sm leading-7 text-slate-700 sm:text-[15px]">
          <section>
            <h2 className="text-lg font-semibold text-slate-900">0. Éditeur du service</h2>
            <p className="mt-2">
              Le service est fourni sous la marque {LEGAL_BRAND_NAME}. Contact légal:
              {" "}{LEGAL_CONTACT_EMAIL} | {LEGAL_CONTACT_PHONE} | {LEGAL_CONTACT_ADDRESS}.
              Support WhatsApp: {LEGAL_SUPPORT_WHATSAPP}.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">1. Objet</h2>
            <p className="mt-2">
              {LEGAL_BRAND_NAME} permet de faciliter la gestion de commandes, paiements
              sécurisés et validations de livraison entre acheteurs, vendeurs et livreurs.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">2. Conditions d'accès</h2>
            <p className="mt-2">
              L'utilisateur s'engage à fournir des informations exactes lors de son
              inscription et à maintenir la confidentialité de ses moyens d'authentification.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">3. Bon usage du service</h2>
            <p className="mt-2">Il est notamment interdit de:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>utiliser l'application à des fins frauduleuses ou illégales,</li>
              <li>publier des contenus trompeurs ou non conformes,</li>
              <li>perturber le fonctionnement technique de la plateforme.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">4. Paiements et livraisons</h2>
            <p className="mt-2">
              Les flux de paiement sont traités par les moyens intégrés dans
              l'application. La validation de livraison peut conditionner la libération
              de certaines opérations financières selon les règles du service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">5. Responsabilités</h2>
            <p className="mt-2">
              Chaque utilisateur reste responsable des informations, transactions et
              actions qu'il effectue via son compte. {LEGAL_BRAND_NAME} s'engage à fournir
              un service fiable, sans garantir l'absence totale d'interruption.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">6. Suspension ou suppression de compte</h2>
            <p className="mt-2">
              En cas de non-respect de ces conditions, le compte peut être suspendu
              ou limité temporairement, selon la gravité de l'incident constaté.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">7. Évolution du service</h2>
            <p className="mt-2">
              {LEGAL_BRAND_NAME} peut modifier ses fonctionnalités, ses règles opérationnelles
              et ces conditions afin d'améliorer la plateforme ou de respecter
              de nouvelles obligations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">8. Contact</h2>
            <p className="mt-2">
              Pour toute question relative à ces conditions, vous pouvez contacter
              l'équipe via {LEGAL_CONTACT_EMAIL}, au {LEGAL_CONTACT_PHONE},
              ou via WhatsApp au {LEGAL_SUPPORT_WHATSAPP}.
            </p>
          </section>
        </div>

        <footer className="mt-10 border-t border-slate-200 pt-5">
          <p className="text-xs text-muted-foreground">
            Pour consulter le traitement des données, lisez aussi les règles de confidentialité.
          </p>
          <Button asChild variant="link" className="mt-1 h-auto px-0 text-sm">
            <Link to={PRIVACY_POLICY_ROUTE}>Lire les règles de confidentialité</Link>
          </Button>
        </footer>
      </main>
    </div>
  );
};

export default TermsOfUsePage;
