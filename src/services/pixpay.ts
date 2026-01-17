// Service PixPay pour le frontend
import { apiUrl } from '@/lib/api';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

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
      // Sur mobile, utiliser l'API Browser de Capacitor en mode in-app
      if (Capacitor.isNativePlatform()) {
        // Ajouter un listener pour détecter la fermeture du navigateur
        const listener = await Browser.addListener('browserFinished', () => {
          console.log('[PixPay] Navigateur in-app fermé par l\'utilisateur');
          // L'utilisateur est revenu à l'application
          // On pourrait rafraîchir les commandes ici
        });

        await Browser.open({ 
          url: smsLink,
          windowName: '_self',
          presentationStyle: 'fullscreen',
          toolbarColor: '#10b981'
        });

        // Nettoyer le listener après ouverture
        setTimeout(() => {
          listener.remove();
        }, 1000);
      } else {
        // Sur web, utiliser window.open
        window.open(smsLink, '_blank');
      }
      console.log('[PixPay] Lien de paiement ouvert en mode in-app:', smsLink);
    } catch (error) {
      console.error('[PixPay] Erreur ouverture lien:', error);
      // Fallback: essayer window.open
      window.open(smsLink, '_blank');
    }
  }
}
