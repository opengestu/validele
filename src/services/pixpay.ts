// Service PixPay pour le frontend
import { apiUrl } from '@/lib/api';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export interface PixPayInitiateRequest {
  amount: number;
  phone: string;
  orderId: string;
  customData?: Record<string, string | number | boolean | null>;
}

export interface PixPayInitiateResponse {
  success: boolean;
  transaction_id?: string;
  provider_id?: string;
  message?: string;
  sms_link?: string;
  amount?: number;
  fee?: number;
  error?: string;
}

export interface PixPayPayoutRequest {
  amount: number;
  phone: string;
  orderId: string;
  type?: string;
}

export class PixPayService {
  /**
   * Initier un paiement Orange Money (collecte)
   */
  async initiatePayment(data: PixPayInitiateRequest): Promise<PixPayInitiateResponse> {
    try {
      const response = await fetch(apiUrl('/api/payment/pixpay/initiate'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors de l\'initiation du paiement');
      }

      return result;
    } catch (error) {
      console.error('[PixPay] Erreur initiation:', error);
      throw error;
    }
  }

  /**
   * Initier un paiement Wave via PixPay
   */
  async initiateWavePayment(data: PixPayInitiateRequest): Promise<PixPayInitiateResponse> {
    try {
      const response = await fetch(apiUrl('/api/payment/pixpay-wave/initiate'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      console.log('[PixPay-Wave] Réponse reçue:', result);

      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors de l\'initiation du paiement Wave');
      }

      return result;
    } catch (error) {
      console.error('[PixPay-Wave] Erreur initiation:', error);
      throw error;
    }
  }

  /**
   * Envoyer de l'argent (payout vendeur(se)/livreur)
   */
  async sendPayout(data: PixPayPayoutRequest): Promise<PixPayInitiateResponse> {
    try {
      const response = await fetch(apiUrl('/api/payment/pixpay/payout'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors de l\'envoi d\'argent');
      }

      return result;
    } catch (error) {
      console.error('[PixPay] Erreur payout:', error);
      throw error;
    }
  }

  /**
   * Ouvrir le lien de paiement (Orange Money ou Wave)
   */
  async openPaymentLink(smsLink: string) {
    if (!smsLink) {
      console.error('[PixPay] Aucun lien de paiement fourni');
      return;
    }

    try {
      // Sur mobile natif, tenter d'ouvrir directement l'application via App.openUrl
      if (Capacitor.isNativePlatform()) {
        try {
          // Some Capacitor AppPlugin versions don't include openUrl in typings.
          // Use a safe runtime check and cast to any to call it when available.
          // If unavailable, fall back to setting window.location.
          const appAny = App as any;
          if (appAny && typeof appAny.openUrl === 'function') {
            await appAny.openUrl({ url: smsLink });
            console.log('[PixPay] App.openUrl success:', smsLink);
            return;
          }

          // If openUrl not available, use window.location as fallback
          (window as any).location.href = smsLink;
          console.log('[PixPay] App.openUrl not available in this runtime — used window.location as fallback:', smsLink);
          return;
        } catch (appErr) {
          console.warn('[PixPay] App.openUrl a échoué ou absent, fallback vers ouverture externe:', appErr);
          // Ne pas ouvrir d'in-app browser — on passe à l'ouverture externe
          try {
            // Sur native, fallback sur window.location (ouvrira le navigateur externe)
            // Cela permet aussi aux Universal Links de rediriger vers l'app si elle est installée
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).location.href = smsLink;
            console.log('[PixPay] Fallback window.location.href (native):', smsLink);
            return;
          } catch (e) {
            console.error('[PixPay] Fallback window.location.href failed:', e);
          }
        }
      }

      // Sur web ou si tout le reste échoue, utiliser window.location (activates Universal Links)
      try {
        window.location.href = smsLink;
        console.log('[PixPay] window.location.href utilisé:', smsLink);
      } catch (e) {
        console.warn('[PixPay] window.location.href a échoué, fallback sur window.open', e);
        try { window.open(smsLink, '_blank'); } catch (e2) { console.error('[PixPay] fallback window.open failed', e2); }
      }

      console.log('[PixPay] Lien de paiement ouvert:', smsLink);
    } catch (error) {
      console.error('[PixPay] Erreur ouverture lien:', error);
      // Fallback: essayer window.open
      // eslint-disable-next-line no-empty
      try { window.open(smsLink, '_blank'); } catch(e){}
    }
  }
}
