import { useState } from 'react';
import { PayDunyaService } from '../services/paydunya';

interface PaymentFormProps {
  amount: number;
  description: string;
  storeName: string;
  onPaymentSuccess?: () => void;
  onPaymentError?: () => void;
}

export const PaymentForm = ({ 
  amount, 
  currency, 
  description, 
  onPaymentSuccess, 
  onPaymentError 
}: PaymentFormProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const payDunyaService = new PayDunyaService();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData(e.currentTarget as HTMLFormElement);
      const paymentData = {
        amount,
        description,
        storeName
      };

      // Créer la facture
      const invoiceResponse = await payDunyaService.createPayment(paymentData);

      if (invoiceResponse.status === 'success' && invoiceResponse.redirect_url) {
        // Redirection vers la page de paiement PayDunya
        window.location.href = invoiceResponse.redirect_url;
      } else {
        throw new Error(invoiceResponse.message || 'Payment creation failed');
      }
    } catch (err: any) {
      setError(err.message);
      onPaymentError?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-center mb-6">Paiement</h2>
      
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email du compte de test
        </label>
        <input
          type="email"
          id="email"
          name="email"
          required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          placeholder="marnel.gnacadja@paydunya.com"
        />
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
          Numéro de téléphone du compte de test
        </label>
        <input
          type="tel"
          id="phone"
          name="phone"
          required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          placeholder="97403627"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Mot de passe du compte de test
        </label>
        <input
          type="password"
          id="password"
          name="password"
          required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          placeholder="Miliey@2121"
        />
      </div>

      {error && (
        <div className="text-red-500 text-sm mt-2">{error}</div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'En cours...' : 'Payer'}
      </button>
    </form>
  );
};
