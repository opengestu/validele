export function toFrenchErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback;

  const status = typeof (error as any)?.status === 'number' ? (error as any).status as number : undefined;

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : fallback;

  const normalized = message.trim();
  const lower = normalized.toLowerCase();

  // SMS provider / backend specific errors
  if (lower.includes('ip_not_whitelisted')) {
    return "Service SMS indisponible (IP du serveur non autorisée). Contactez l'administrateur ou réessayez plus tard.";
  }

  // Supabase FK error when profiles.id must exist in auth.users
  if (lower.includes('profiles_id_fkey') || (lower.includes('foreign key constraint') && lower.includes('profiles'))) {
    return "Erreur de création du compte. Le serveur n'est pas correctement configuré pour l'inscription par SMS. Contactez l'administrateur.";
  }

  // Common browser/network fetch failures
  if (
    lower === 'failed to fetch' ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network error') ||
    lower.includes('load failed')
  ) {
    // Prefer a clear French message for end-users.
    return "Pas de connexion. Vérifiez votre Internet puis réessayez.";
  }

  // Abort (timeouts)
  if (lower.includes('aborted') || lower.includes('aborterror') || lower.includes('timeout')) {
    return "La requête a expiré. Vérifiez votre connexion puis réessayez.";
  }

  // HTTP status-based messages (when available on thrown errors).
  // Only override when the error message is generic/unhelpful; otherwise keep the server-provided message.
  if (typeof status === 'number') {
    const isGenericMessage =
      !normalized ||
      normalized === fallback ||
      lower === 'internal error' ||
      lower === 'internal server error' ||
      lower === 'not found' ||
      lower === 'unauthorized' ||
      lower === 'forbidden' ||
      lower === 'unknown error' ||
      lower === 'error' ||
      lower === 'erreur' ||
      lower === 'erreur inconnue' ||
      lower === 'erreur serveur' ||
      lower.startsWith('erreur lors') ||
      lower.startsWith('error:');

    if (isGenericMessage) {
      if (status === 401 || status === 403) {
        return "Accès refusé. Veuillez vous reconnecter puis réessayer.";
      }
      if (status === 404) {
        return "Service introuvable. Le backend n'expose pas cet endpoint (ou l'URL est incorrecte).";
      }
      if (status === 429) {
        return "Trop de tentatives. Veuillez patienter puis réessayer.";
      }
      if (status >= 500) {
        return `Serveur indisponible (erreur ${status}). Réessayez dans quelques instants.`;
      }
    }
  }

  return normalized || fallback;
}
