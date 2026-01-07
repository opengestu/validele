export function toFrenchErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback;

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

  return normalized || fallback;
}
