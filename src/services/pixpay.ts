// Service PixPay pour le frontend
import { apiUrl } from '@/lib/api';

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
   * Envoyer de l'argent (payout vendeur/livreur)
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
   * Ouvrir le lien SMS de paiement Orange Money
   */
  openPaymentLink(smsLink: string) {
    if (smsLink) {
      window.open(smsLink, '_blank');
    }
  }
}
