
import React from 'react';
import { QrCode, Download, Share2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface OrderQRCodeProps {
  qrCode: string;
  orderCode: string;
  productName: string;
  totalAmount: number;
}

const OrderQRCode = ({ qrCode, orderCode, productName, totalAmount }: OrderQRCodeProps) => {
  const { toast } = useToast();

  const formatToken = (s: string) => {
    if (!s) return '';
    const cleaned = s.toString().replace(/[^a-z0-9]/gi, '').toUpperCase();
    return cleaned.match(/.{1,4}/g)?.join('-') || cleaned;
  }

  const generateQRCodeDataURL = (text: string) => {
    // Simulation d'un QR code avec du texte pour demo
    // En production, vous pourriez utiliser une librairie comme 'qrcode'
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const size = 200;
    canvas.width = size;
    canvas.height = size;
    
    if (ctx) {
      // Background blanc
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      
      // Bordure
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, size - 20, size - 20);
      
      // Simuler un pattern QR simple
      ctx.fillStyle = '#000000';
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
          if ((i + j + text.length) % 3 === 0) {
            ctx.fillRect(20 + i * 16, 20 + j * 16, 14, 14);
          }
        }
      }
      
      // Texte au centre
      ctx.fillStyle = '#000000';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(text.substring(0, 8), size / 2, size / 2 + 20);
    }
    
    return canvas.toDataURL();
  };

  const handleDownload = () => {
    const dataURL = generateQRCodeDataURL(qrCode);
    const link = document.createElement('a');
    link.download = `qr-code-${orderCode}.png`;
    link.href = dataURL;
    link.click();
    
    toast({
      title: "QR Code téléchargé",
      description: "Le QR Code a été téléchargé avec succès",
    });
  };

  const handleShare = async () => {
    try {
      await navigator.share({
        title: `QR Code - Commande ${orderCode}`,
        text: `Code QR pour la commande ${orderCode}: ${qrCode}`,
      });
    } catch (error) {
      // Fallback: copier dans le presse-papier
      navigator.clipboard.writeText(qrCode);
      toast({
        title: "Code copié",
        description: "Le code QR a été copié dans le presse-papier",
      });
    }
  };

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-center">
          <QrCode className="h-6 w-6 mr-2" />
          Code QR de livraison
        </CardTitle>
      </CardHeader>
      <CardContent className="text-center space-y-6">
        {/* QR Code visuel */}
        <div className="bg-white p-4 rounded-lg border-2 border-gray-200 inline-block">
          <img 
            src={generateQRCodeDataURL(qrCode)} 
            alt={`QR Code pour ${orderCode}`}
            className="w-48 h-48 mx-auto"
          />
        </div>
        
        {/* Informations de la commande */}
        <div className="space-y-2">
          <p className="text-sm text-gray-600">Commande: <span className="font-semibold">{orderCode}</span></p>
          <p className="text-sm text-gray-600">Produit: <span className="font-semibold">{productName}</span></p>
          <p className="text-sm text-gray-600">Montant: <span className="font-semibold text-green-600">{totalAmount.toLocaleString()} FCFA</span></p>
          <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
            Code: {formatToken(qrCode)}
          </p>
        </div>
        
        {/* Instructions */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <p className="text-sm text-blue-800 font-medium mb-2">Instructions:</p>
          <ul className="text-xs text-blue-700 space-y-1 text-left">
            <li>• Donnez le code commande <strong>{orderCode}</strong> au vendeur</li>
            <li>• Présentez ce QR code sécurisé au livreur lors de la livraison</li>
            <li>• Le livreur le scannera pour valider la réception</li>
            <li>• Gardez ce code jusqu'à la livraison complète</li>
          </ul>
        </div>
        
        {/* Actions */}
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={handleDownload} size="sm">
            <Download className="h-4 w-4 mr-2" />
            Télécharger
          </Button>
          <Button variant="outline" onClick={handleShare} size="sm">
            <Share2 className="h-4 w-4 mr-2" />
            Partager
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default OrderQRCode;
