import { useState } from 'react';
import { PayDunyaService } from '../services/paydunya';
import { PixPayService } from '../services/pixpay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, CreditCard, Smartphone } from 'lucide-react';

interface PaymentFormProps {
  amount: number;
  description?: string;
  storeName?: string;
  orderId?: string;
  buyerPhone?: string;
  onPaymentSuccess?: () => void;
  onPaymentError?: (error: string) => void;
  paydunya?: {
    token: string;
    onDirectPayment: (phone: string, password: string, email: string) => Promise<void>;
  };
}

export const PaymentForm = ({ 
  amount, 
  description, 
  storeName,
  orderId,
  buyerPhone,
  onPaymentSuccess, 
  onPaymentError,
  paydunya
}: PaymentFormProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'orange_money' | 'wave' | 'paydunya'>('orange_money');
  const [phone, setPhone] = useState(buyerPhone || '');
  const [smsLink, setSmsLink] = useState<string | null>(null);
  const [waveMessage, setWaveMessage] = useState<string | null>(null);
  
  const payDunyaService = new PayDunyaService();
  const pixPayService = new PixPayService();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSmsLink(null);

    try {
      if (paymentMethod === 'orange_money') {
        // Paiement Orange Money via PixPay
        if (!phone) {
          throw new Error('Numéro de téléphone requis');
        }

        const result = await pixPayService.initiatePayment({
          amount,
          phone,
          orderId: orderId || `ORDER_${Date.now()}`,
          customData: {
            description: description || '',
            storeName: storeName || ''
          }
        });

        if (result.success && result.sms_link) {
          setSmsLink(result.sms_link);
          // Ouvrir le lien automatiquement
          pixPayService.openPaymentLink(result.sms_link);
          
          // Note: Ne PAS marquer comme payé ici !
          // Le statut sera mis à jour automatiquement via le webhook PixPay
        } else {
          throw new Error(result.error || result.message || 'Erreur paiement Orange Money');
        }
        
      } else if (paymentMethod === 'wave') {
        // Paiement Wave via PixPay
        if (!phone) {
          throw new Error('Numéro de téléphone requis');
        }

        const result = await pixPayService.initiateWavePayment({
          amount,
          phone,
          orderId: orderId || `ORDER_${Date.now()}`,
          customData: {
            description: description || '',
            storeName: storeName || ''
          }
        });

        if (result.success && result.sms_link) {
          setSmsLink(result.sms_link);
          // Ouvrir le lien Wave automatiquement
          pixPayService.openPaymentLink(result.sms_link);
          
          // Afficher le message de confirmation
          setWaveMessage(result.message || 'Paiement Wave initié. Validez sur votre téléphone.');
        } else {
          throw new Error(result.error || result.message || 'Erreur paiement Wave');
        }
      }
    } catch (err) {
      const errorMsg = (err as Error).message || 'Erreur lors du paiement';
      setError(errorMsg);
      onPaymentError?.(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-center mb-6">Paiement</h2>
      
      <div className="mb-6">
        <p className="text-lg font-semibold text-center">
          Montant : {amount} FCFA
        </p>
        <p className="text-sm text-gray-600 text-center mt-2">{description}</p>
      </div>

      {/* Choix du mode de paiement */}
      <div className="space-y-3">
        <Label>Mode de paiement</Label>
        <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as 'orange_money' | 'wave' | 'paydunya')}>
          <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-gray-50">
            <RadioGroupItem value="orange_money" id="orange_money" />
            <Label htmlFor="orange_money" className="flex items-center gap-2 cursor-pointer flex-1">
              <Smartphone className="h-5 w-5 text-orange-600" />
              <span>🟠 Orange Money</span>
            </Label>
          </div>
          <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-gray-50">
            <RadioGroupItem value="wave" id="wave" />
            <Label htmlFor="wave" className="flex items-center gap-2 cursor-pointer flex-1">
              <Smartphone className="h-5 w-5 text-blue-600" />
              <span>💙 Wave</span>
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Formulaire Orange Money / Wave */}
      {(paymentMethod === 'orange_money' || paymentMethod === 'wave') && (
        <div className="space-y-4 mt-4">
          <div>
            <Label htmlFor="phone">Numéro {paymentMethod === 'orange_money' ? 'Orange Money' : 'Wave'}</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              pattern="[0-9+\s-]*"
              placeholder="+221 77 XXX XX XX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="text-xl md:text-base h-14 md:h-10"
              style={{ fontSize: '20px' }}
            />
            <p className="text-xs text-gray-500 mt-1">
              {paymentMethod === 'orange_money' 
                ? 'Un lien de paiement s\'ouvrira automatiquement dans votre navigateur'
                : 'Vous serez redirigé vers Wave pour valider le paiement'
              }
            </p>
          </div>
          
          {smsLink && smsLink !== 'validated' && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
              <p className="text-sm text-blue-900 font-semibold">
                � Lien de paiement ouvert !
              </p>
              <p className="text-sm text-blue-800">
                1. Un onglet s'est ouvert dans votre navigateur<br />
                2. Suivez les instructions pour payer avec Orange Money<br />
                3. Votre commande sera automatiquement mise à jour après paiement
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => pixPayService.openPaymentLink(smsLink)}
                className="w-full"
              >
                Ouvrir à nouveau le lien
              </Button>
              <p className="text-xs text-blue-600 text-center">
                ⚠️ Ne fermez pas cette fenêtre avant de valider le paiement
              </p>
            </div>
          )}
        </div>
      )}

      {/* Message Wave après initiation */}
      {smsLink === 'validated' && paymentMethod === 'wave' && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900 font-semibold">
            📱 Paiement Wave initié !
          </p>
          <p className="text-sm text-blue-800 mt-2">
            {waveMessage || "Validez l'opération en cliquant sur le lien. La session expire dans 15 min"}
          </p>
          <p className="text-xs text-blue-600 mt-2">
            ⚠️ Consultez votre téléphone Wave pour valider le paiement.<br />
            Votre commande sera automatiquement mise à jour après validation.
          </p>
        </div>
      )}

      {error && (
        <div className="text-red-500 text-sm mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">{error}</div>
      )}

      <Button
        type="submit"
        disabled={loading}
        className="w-full"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin local-spinner" />
            En cours...
          </>
        ) : (
          `Payer ${amount} FCFA`
        )}
      </Button>
    </form>
  );
};
