// Service OTP via Direct7Networks (backend)
import { apiUrl } from '@/lib/api';

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

  const data = await response.json();
  
  if (!response.ok) {
    const err = new Error(data.error || 'Erreur lors de l\'envoi du code') as Error & { status?: number; body?: unknown };
    err.status = response.status;
    err.body = data;
    throw err;
  }
  
  return data;
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

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Code incorrect');
  }
  
  return data;
}
