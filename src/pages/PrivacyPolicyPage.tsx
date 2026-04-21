import React from "react";
import { ArrowLeft, FileLock2 } from "lucide-react";
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
  TERMS_OF_USE_ROUTE,
} from "@/lib/legalConsent";

const PrivacyPolicyPage: React.FC = () => {
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
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            <FileLock2 className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Règles de confidentialité
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Cette page explique quelles données sont traitées dans {LEGAL_BRAND_NAME},
            pourquoi elles sont collectées et quels sont vos droits.
          </p>
        </header>

        <div className="space-y-7 text-sm leading-7 text-slate-700 sm:text-[15px]">
          <section>
            <h2 className="text-lg font-semibold text-slate-900">0. Responsable du traitement</h2>
            <p className="mt-2">
              Le service est exploité sous la marque {LEGAL_BRAND_NAME}. Contact légal:
              {" "}{LEGAL_CONTACT_EMAIL} | {LEGAL_CONTACT_PHONE} | {LEGAL_CONTACT_ADDRESS}.
              Support WhatsApp: {LEGAL_SUPPORT_WHATSAPP}.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">1. Données collectées</h2>
            <p className="mt-2">
              Selon votre usage, nous pouvons collecter les informations suivantes:
              numéro de téléphone, nom complet, rôle utilisateur, informations de commande,
              historique des paiements et données techniques nécessaires au bon fonctionnement
              de l'application.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">2. Finalités du traitement</h2>
            <p className="mt-2">Ces données sont utilisées pour:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>authentifier les utilisateurs et sécuriser les sessions,</li>
              <li>gérer les commandes, paiements et livraisons,</li>
              <li>envoyer des notifications utiles au suivi des opérations,</li>
              <li>améliorer la qualité et la sécurité du service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">3. Base légale du traitement</h2>
            <p className="mt-2">
              Les traitements reposent sur l'exécution du service demandé,
              sur des obligations légales applicables et, lorsque requis,
              sur votre consentement.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">4. Durée de conservation</h2>
            <p className="mt-2">
              Les données sont conservées pendant la durée strictement nécessaire
              à la fourniture du service et au respect des obligations légales.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">5. Partage des données</h2>
            <p className="mt-2">
              Les données peuvent être partagées avec des prestataires techniques
              et des partenaires de paiement, strictement pour l'exécution des services,
              dans le respect de mesures de sécurité appropriées.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">6. Vos droits</h2>
            <p className="mt-2">Vous pouvez demander:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>l'accès à vos données personnelles,</li>
              <li>la rectification de données inexactes,</li>
              <li>la suppression de certaines données selon le cadre légal,</li>
              <li>la limitation ou l'opposition à certains traitements.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">7. Sécurité</h2>
            <p className="mt-2">
              Nous mettons en place des mesures techniques et organisationnelles
              raisonnables pour protéger vos données contre les accès non autorisés,
              les pertes ou les altérations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">8. Mise à jour de cette politique</h2>
            <p className="mt-2">
              Cette politique peut être mise à jour. En cas de changement important,
              une nouvelle version pourra vous être présentée dans l'application.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">9. Exercice de vos droits</h2>
            <p className="mt-2">
              Pour toute demande liée à vos données personnelles (accès,
              rectification, suppression, opposition), vous pouvez écrire à {LEGAL_CONTACT_EMAIL}
              ou contacter le support via WhatsApp au {LEGAL_SUPPORT_WHATSAPP}.
            </p>
          </section>
        </div>

        <footer className="mt-10 border-t border-slate-200 pt-5">
          <p className="text-xs text-muted-foreground">
            Pour poursuivre, vous devez également consulter les conditions d'utilisation.
          </p>
          <Button asChild variant="link" className="mt-1 h-auto px-0 text-sm">
            <Link to={TERMS_OF_USE_ROUTE}>Lire les conditions d'utilisation</Link>
          </Button>
        </footer>
      </main>
    </div>
  );
};

export default PrivacyPolicyPage;
