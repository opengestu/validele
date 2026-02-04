// Service OTP via Direct7Networks (backend)
import { apiUrl, safeJson } from '@/lib/api';

export interface OTPSendResponse {
  success: boolean;
  message?: string;
  phone?: string;
  error?: string;
}

export interface OTPVerifyResponse {
  success: boolean;
  valid?: boolean;
  error?: string;
}

// Envoyer un code OTP
export async function sendOTP(phone: string, opts?: { allowExisting?: boolean }): Promise<OTPSendResponse> {
  const response = await fetch(apiUrl('/api/otp/send'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone, allowExisting: !!(opts && opts.allowExisting) }),
  });

  const data = await safeJson(response);
  if (data && typeof data === 'object' && '__parseError' in data) {
    const err = new Error('Réponse invalide du serveur (JSON attendu).') as Error & { status?: number; body?: unknown };
    err.status = response.status;
    err.body = { raw: (data as unknown as { __raw: string }).__raw };
    throw err;
  }
  
  if (!response.ok) {
    const err = new Error(
      (data as { error?: string; message?: string } | null)?.error ||
        (data as { error?: string; message?: string } | null)?.message ||
        "Erreur lors de l'envoi du code"
    ) as Error & { status?: number; body?: unknown };
    err.status = response.status;
    err.body = data;
    throw err;
  }
  
  return (data as OTPSendResponse) ?? { success: false, error: 'Réponse vide du serveur' };
}

// Vérifier un code OTP
export async function verifyOTP(phone: string, code: string): Promise<OTPVerifyResponse> {
  const response = await fetch(apiUrl('/api/otp/verify'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone, code }),
  });

  const data = await safeJson(response);
  if (data && typeof data === 'object' && '__parseError' in data) {
    const err = new Error('Réponse invalide du serveur (JSON attendu).') as Error & { status?: number; body?: unknown };
    err.status = response.status;
    err.body = { raw: (data as unknown as { __raw: string }).__raw };
    throw err;
  }
  
  if (!response.ok) {
    const err = new Error(
      (data as { error?: string; message?: string } | null)?.error ||
        (data as { error?: string; message?: string } | null)?.message ||
        'Code incorrect'
    ) as Error & { status?: number; body?: unknown };
    err.status = response.status;
    err.body = data;
    throw err;
  }
  
  return (data as OTPVerifyResponse) ?? { success: false, valid: false, error: 'Réponse vide du serveur' };
}
