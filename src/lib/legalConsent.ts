export const LEGAL_ACCEPTANCE_KEY = "validele:legal_accepted_v1";
export const LEGAL_VERSION = "2026-04-20";
export const LEGAL_FEATURE_ENABLED = false;

export const LEGAL_BRAND_NAME = "Validèl";
export const LEGAL_CONTACT_EMAIL = "contact@validel.com";
export const LEGAL_CONTACT_PHONE = "+221777804136";
export const LEGAL_SUPPORT_WHATSAPP = "+221777804136";
export const LEGAL_CONTACT_ADDRESS = "Dakar, Sénégal";

export const LEGAL_CONSENT_ROUTE = "/acceptation-legale";
export const PRIVACY_POLICY_ROUTE = "/regles-confidentialite";
export const TERMS_OF_USE_ROUTE = "/conditions-utilisation";

type LegalAcceptancePayload = {
  version: string;
  acceptedAt: string;
};

export const hasAcceptedLegal = (): boolean => {
  if (!LEGAL_FEATURE_ENABLED) {
    return true;
  }

  if (typeof window === "undefined") {
    return true;
  }

  try {
    const raw = window.localStorage.getItem(LEGAL_ACCEPTANCE_KEY);
    if (!raw) {
      return false;
    }

    // Backward-compatible value if a simple flag was used before.
    if (raw === "1") {
      return true;
    }

    const parsed = JSON.parse(raw) as Partial<LegalAcceptancePayload> | null;
    return Boolean(parsed && parsed.version === LEGAL_VERSION);
  } catch {
    return false;
  }
};

export const markLegalAccepted = (): void => {
  if (!LEGAL_FEATURE_ENABLED) {
    return;
  }

  if (typeof window === "undefined") {
    return;
  }

  const payload: LegalAcceptancePayload = {
    version: LEGAL_VERSION,
    acceptedAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(LEGAL_ACCEPTANCE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors on restricted browsers.
  }
};
