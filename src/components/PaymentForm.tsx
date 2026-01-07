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
  const [paymentMethod, setPaymentMethod] = useState<'paydunya' | 'pixpay'>('pixpay');
  const [phone, setPhone] = useState(buyerPhone || '');
  const [smsLink, setSmsLink] = useState<string | null>(null);
  
  const payDunyaService = new PayDunyaService();
  const pixPayService = new PixPayService();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSmsLink(null);

    try {
      if (paymentMethod === 'pixpay') {
        // Paiement Orange Money via PixPay
        if (!phone) {
          throw new Error('Numéro de téléphone requis');
        }

        const result = await pixPayService.initiatePayment({
          amount,
          phone,
          orderId: orderId || `ORDER_${Date.now()}`,
          customData: {
            description,
            storeName
          }
        });

        if (result.success && result.sms_link) {
          setSmsLink(result.sms_link);
          // Ouvrir le lien SMS automatiquement
          pixPayService.openPaymentLink(result.sms_link);
          
          // Note: Ne PAS marquer comme payé ici !
          // Le statut sera mis à jour automatiquement via le webhook PixPay
          // quand le client validera le paiement sur son téléphone
        } else {
          throw new Error(result.error || result.message || 'Erreur paiement');
        }
        
      } else {
        // Paiement PayDunya (existant)
        if (paydunya) {
          // Mode direct payment (sandbox)
          const formData = new FormData(e.currentTarget as HTMLFormElement);
          const phone = formData.get('phone') as string;
          const password = formData.get('password') as string;
          const email = formData.get('email') as string;
          
          await paydunya.onDirectPayment(phone, password, email);
          onPaymentSuccess?.();
        } else {
          // Mode redirection (production)
          const paymentData = {
            amount,
            description: description || 'Paiement',
            storeName: storeName || 'Validel'
          };

          const invoiceResponse = await payDunyaService.createPayment(paymentData);

          if (invoiceResponse.status === 'success' && invoiceResponse.redirect_url) {
            window.location.href = invoiceResponse.redirect_url;
          } else {
            throw new Error(invoiceResponse.message || 'Erreur création paiement');
          }
        }
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Erreur lors du paiement';
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
        <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as 'paydunya' | 'pixpay')}>
          <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-gray-50">
            <RadioGroupItem value="pixpay" id="pixpay" />
            <Label htmlFor="pixpay" className="flex items-center gap-2 cursor-pointer flex-1">
              <Smartphone className="h-5 w-5 text-orange-600" />
              <span>Orange Money (PixPay)</span>
            </Label>
          </div>
          <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-gray-50">
            <RadioGroupItem value="paydunya" id="paydunya" />
            <Label htmlFor="paydunya" className="flex items-center gap-2 cursor-pointer flex-1">
              <CreditCard className="h-5 w-5 text-blue-600" />
              <span>PayDunya (Carte/Mobile Money)</span>
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Formulaire Orange Money */}
      {paymentMethod === 'pixpay' && (
        <div className="space-y-4 mt-4">
          <div>
            <Label htmlFor="phone">Numéro Orange Money</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+221 77 XXX XX XX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Vous recevrez un SMS pour valider le paiement
            </p>
          </div>
          
          {smsLink && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
              <p className="text-sm text-blue-900 font-semibold">
                📱 Lien de paiement envoyé !
              </p>
              <p className="text-sm text-blue-800">
                1. Consultez le lien qui s'est ouvert<br />
                2. Validez le paiement sur votre téléphone<br />
                3. Votre commande sera automatiquement mise à jour
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

      {/* Formulaire PayDunya */}
      {paymentMethod === 'paydunya' && (
        <div className="space-y-4 mt-4">
          {paydunya && (
            <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
              <b>Mode test PayDunya :</b> Utilisez les identifiants ci-dessous<br />
              <b>Email :</b> marnel.gnacadja@paydunya.com<br />
              <b>Téléphone :</b> 97403627<br />
              <b>Mot de passe :</b> Miliey@2121
            </div>
          )}
          
          <div>
            <Label htmlFor="email">Email du compte{paydunya ? ' de test' : ''}</Label>
            <Input
              type="email"
              id="email"
              name="email"
              required
              placeholder="marnel.gnacadja@paydunya.com"
              defaultValue={paydunya ? "marnel.gnacadja@paydunya.com" : ""}
            />
          </div>

          <div>
            <Label htmlFor="paydunya-phone">Téléphone du compte{paydunya ? ' de test' : ''}</Label>
            <Input
              type="tel"
              id="paydunya-phone"
              name="phone"
              required
              placeholder="97403627"
              defaultValue={paydunya ? "97403627" : ""}
            />
          </div>

          <div>
            <Label htmlFor="password">Mot de passe du compte{paydunya ? ' de test' : ''}</Label>
            <Input
              type="password"
              id="password"
              name="password"
              required
              placeholder="Miliey@2121"
              defaultValue={paydunya ? "Miliey@2121" : ""}
            />
          </div>
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
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            En cours...
          </>
        ) : (
          `Payer ${amount} FCFA`
        )}
      </Button>
    </form>
  );
};
