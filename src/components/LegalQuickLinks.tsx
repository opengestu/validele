import React from "react";
import { Link, useLocation } from "react-router-dom";

import {
  LEGAL_FEATURE_ENABLED,
  LEGAL_CONSENT_ROUTE,
  PRIVACY_POLICY_ROUTE,
  TERMS_OF_USE_ROUTE,
} from "@/lib/legalConsent";

const hiddenRoutes = new Set([
  LEGAL_CONSENT_ROUTE,
  PRIVACY_POLICY_ROUTE,
  TERMS_OF_USE_ROUTE,
]);

const LegalQuickLinks: React.FC = () => {
  const location = useLocation();

  if (!LEGAL_FEATURE_ENABLED) {
    return null;
  }

  if (hiddenRoutes.has(location.pathname)) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-md backdrop-blur">
        <Link
          to={PRIVACY_POLICY_ROUTE}
          className="font-medium text-slate-600 transition-colors hover:text-slate-900"
        >
          Confidentialité
        </Link>
        <span className="h-1 w-1 rounded-full bg-slate-300" />
        <Link
          to={TERMS_OF_USE_ROUTE}
          className="font-medium text-slate-600 transition-colors hover:text-slate-900"
        >
          Conditions d'utilisation
        </Link>
      </div>
    </div>
  );
};

export default LegalQuickLinks;
