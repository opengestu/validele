import axios from 'axios';

interface PaymentRequest {
  amount: number;
  description: string;
  storeName: string;
}

interface PaymentResponse {
  status: 'success' | 'failed';
  transaction_id?: string;
  redirect_url?: string;
  message?: string;
}

export class PayDunyaService {
  private baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  private masterKey: string;
  private privateKey: string;
  private token: string;

  constructor() {
    this.masterKey = import.meta.env.VITE_PAYDUNYA_MASTER_KEY;
    this.privateKey = import.meta.env.VITE_PAYDUNYA_PRIVATE_KEY;
    this.token = import.meta.env.VITE_PAYDUNYA_TOKEN;
  }

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
    };
  }

  async createPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/payments/invoice`,
        {
          amount: request.amount,
          description: request.description,
          storeName: request.storeName
        },
        {
          headers: this.getHeaders(),
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error creating payment:', error.response?.data || error.message);
      return {
        status: 'failed',
        transaction_id: null,
        message: error.response?.data?.message || 'Payment creation failed',
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
        `${this.baseUrl}/api/payments/payment`,
        {
          token,
          phone_number: customerInfo.phone_number,
          customer_email: customerInfo.customer_email,
          password: customerInfo.password
        },
        {
          headers: this.getHeaders(),
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error making payment:', error.response?.data || error.message);
      return {
        status: 'failed',
        transaction_id: null,
        message: error.response?.data?.message || 'Payment failed',
      };
    }
  }
}
