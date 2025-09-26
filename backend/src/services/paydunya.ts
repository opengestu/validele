import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

interface PaymentRequest {
  invoice: {
    total_amount: number;
    description: string;
  };
  store: {
    name: string;
  };
}

interface PaymentResponse {
  status: 'success' | 'pending' | 'failed';
  transaction_id?: string;
  redirect_url?: string;
  message?: string;
  receipt_url?: string;
}

export class PayDunyaService {
  private baseUrl: string;
  private masterKey: string;
  private privateKey: string;
  private token: string;

  constructor() {
    this.baseUrl = process.env.PAYDUNYA_MODE === 'sandbox' 
      ? 'https://app.paydunya.com/sandbox-api/v1'
      : 'https://app.paydunya.com/api/v1';
    
    this.masterKey = process.env.PAYDUNYA_MASTER_KEY || '';
    this.privateKey = process.env.PAYDUNYA_PRIVATE_KEY || '';
    this.token = process.env.PAYDUNYA_TOKEN || '';
  }

  // Fonction pour formater le numéro de téléphone pour Orange Money Sénégal
  // L'API PayDunya Orange Money attend le format local sénégalais (ex: 778676477)
  private formatPhoneForOrangeMoney(phone: string): string {
    if (!phone) return '';
    
    // Nettoyer le numéro (supprimer espaces, tirets, parenthèses)
    let cleanPhone = phone.replace(/[\s\-()]/g, '');
    
    // Supprimer le préfixe +221 s'il existe
    if (cleanPhone.startsWith('+221')) {
      cleanPhone = cleanPhone.substring(4);
    }
    
    // Supprimer le préfixe 221 s'il existe
    if (cleanPhone.startsWith('221')) {
      cleanPhone = cleanPhone.substring(3);
    }
    
    // Vérifier que le numéro commence par 7 ou 3 (numéros mobiles sénégalais)
    if (cleanPhone.startsWith('7') || cleanPhone.startsWith('3')) {
      return cleanPhone;
    }
    
    // Si le numéro ne commence pas par 7 ou 3, l'assumer comme valide tel quel
    return cleanPhone;
  }

  private getHeaders() {
    return {
      'PAYDUNYA-MASTER-KEY': this.masterKey,
      'PAYDUNYA-PRIVATE-KEY': this.privateKey,
      'PAYDUNYA-TOKEN': this.token,
      'Content-Type': 'application/json',
    };
  }

  async createInvoice(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      // LOGS DEBUG
      console.log('PayDunya - URL:', this.baseUrl + '/checkout-invoice/create');
      console.log('PayDunya - Headers:', this.getHeaders());
      console.log('PayDunya - Body:', {
        invoice: {
          total_amount: request.invoice.total_amount,
          description: request.invoice.description
        },
        store: {
          name: request.store.name
        }
      });
      // FIN LOGS DEBUG
      const response = await axios.post(
        `${this.baseUrl}/checkout-invoice/create`,
        {
          invoice: {
            total_amount: request.invoice.total_amount,
            description: request.invoice.description
          },
          store: {
            name: request.store.name
          },
          return_url: 'https://glistening-sawine-9c59f8.netlify.app/buyer'
        },
        {
          headers: this.getHeaders(),
        }
      );
      // LOG REPONSE
      console.log('PayDunya - Réponse:', response.data);
      // FIN LOG REPONSE
      if (response.data.response_code === '00') {
        return {
          status: 'success',
          transaction_id: response.data.token,
          redirect_url: response.data.response_text,
          receipt_url: response.data.receipt_url // Ajout du PDF si présent
        };
      } else {
        throw new Error(response.data.description || 'Invoice creation failed');
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error creating invoice:', error.response?.data || error.message);
      return {
        status: 'failed',
        message: error.response?.data?.message || 'Invoice creation failed',
      };
    }
  }

  async makePayment(token: string, customerInfo: {
    phone_number: string;
    customer_email: string;
    password: string;
  }): Promise<PaymentResponse> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/checkout/make-payment`,
        {
          phone_number: customerInfo.phone_number,
          customer_email: customerInfo.customer_email,
          password: customerInfo.password,
          invoice_token: token
        },
        {
          headers: this.getHeaders(),
        }
      );

      if (response.data.success) {
        return {
          status: 'success',
          transaction_id: token,
          message: response.data.message,
        };
      } else {
        throw new Error(response.data.message || 'Payment failed');
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error making payment:', error.response?.data || error.message);
      return {
        status: 'failed',
        message: error.response?.data?.message || 'Payment failed',
      };
    }
  }

  async verifyPayment(token: string): Promise<PaymentResponse> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/checkout/invoice/${token}/status`,
        {
          headers: this.getHeaders(),
        }
      );

      if (response.data.status === 'completed') {
        return {
          status: 'success',
          transaction_id: token,
          message: 'Paiement effectué avec succès',
        };
      } else {
        return {
          status: 'pending',
          transaction_id: token,
          message: 'Paiement en attente',
        };
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error verifying payment:', error.response?.data || error.message);
      return {
        status: 'failed',
        transaction_id: token,
        message: error.response?.data?.message || 'Erreur de vérification',
      };
    }
  }

  async softPayWaveSenegal(params: {
    fullName: string;
    email: string;
    phone: string;
    payment_token: string;
  }) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/softpay/wave-senegal`,
        {
          wave_senegal_fullName: params.fullName,
          wave_senegal_email: params.email,
          wave_senegal_phone: params.phone,
          wave_senegal_payment_token: params.payment_token
        },
        {
          headers: this.getHeaders(),
        }
      );
      return response.data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error SoftPay Wave:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Erreur SoftPay Wave',
      };
    }
  }

  async softPayOrangeMoneySenegal(params: {
    customer_name: string;
    customer_email: string;
    phone_number: string;
    invoice_token: string;
    api_type: 'QRCODE' | 'OTPCODE';
    authorization_code?: string;
  }) {
    try {
      // Formater le numéro de téléphone au format local sénégalais
      const formattedPhone = this.formatPhoneForOrangeMoney(params.phone_number);
      console.log(`[ORANGE-MONEY-TS] Numéro original: ${params.phone_number}, formaté (local): ${formattedPhone}`);
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        customer_name: params.customer_name,
        customer_email: params.customer_email,
        phone_number: formattedPhone,
        invoice_token: params.invoice_token,
        api_type: params.api_type
      };
      if (params.api_type === 'OTPCODE' && params.authorization_code) {
        payload.authorization_code = params.authorization_code;
      }
      const response = await axios.post(
        `${this.baseUrl}/softpay/new-orange-money-senegal`,
        payload,
        {
          headers: this.getHeaders(),
        }
      );
      return response.data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error SoftPay Orange Money:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Erreur SoftPay Orange Money',
      };
    }
  }

  /**
   * Crée une facture de déboursement PayDunya (get-invoice)
   */
  async createDisburseInvoice(params: {
    account_alias: string;
    amount: number;
    withdraw_mode: string; // 'wave-senegal' ou 'orange-senegal'
    callback_url: string;
  }) {
    try {
      console.log('[PAYDUNYA] Requête createDisburseInvoice:', params);
      const response = await axios.post(
        'https://app.paydunya.com/api/v2/disburse/get-invoice',
        {
          account_alias: params.account_alias,
          amount: params.amount,
          withdraw_mode: params.withdraw_mode,
          callback_url: params.callback_url,
        },
        {
          headers: {
            'PAYDUNYA-MASTER-KEY': this.masterKey,
            'PAYDUNYA-PRIVATE-KEY': this.privateKey,
            'PAYDUNYA-TOKEN': this.token,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log('[PAYDUNYA] Réponse createDisburseInvoice:', response.data);
      return response.data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('[PAYDUNYA] Erreur création disburse invoice:', error.response?.data || error.message);
      throw new Error(error.response?.data?.response_text || 'Erreur création disburse invoice');
    }
  }

  /**
   * Soumet une facture de déboursement PayDunya (submit-invoice)
   */
  async submitDisburseInvoice(params: {
    disburse_invoice: string;
    disburse_id: string;
  }) {
    try {
      console.log('[PAYDUNYA] Requête submitDisburseInvoice:', params);
      const response = await axios.post(
        'https://app.paydunya.com/api/v2/disburse/submit-invoice',
        {
          disburse_invoice: params.disburse_invoice,
          disburse_id: params.disburse_id,
        },
        {
          headers: {
            'PAYDUNYA-MASTER-KEY': this.masterKey,
            'PAYDUNYA-PRIVATE-KEY': this.privateKey,
            'PAYDUNYA-TOKEN': this.token,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log('[PAYDUNYA] Réponse submitDisburseInvoice:', response.data);
      return response.data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('[PAYDUNYA] Erreur soumission disburse invoice:', error.response?.data || error.message);
      throw new Error(error.response?.data?.response_text || 'Erreur soumission disburse invoice');
    }
  }
}
