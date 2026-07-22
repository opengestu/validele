import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

// Lien de partage propre et rassurant : le vendeur partage
// https://www.validel.shop/acheter/{code} (branché Validèl, pas un long lien
// wa.me encodé qui fait "louche"). Ce composant redirige aussitôt vers le bot
// WhatsApp Validèl, code produit pré-rempli, prêt à envoyer.
const ProductGoRedirect = () => {
  const { code } = useParams<{ code?: string }>();

  useEffect(() => {
    const safeCode = String(code || '').trim();
    const botNumber = String(import.meta.env.VITE_WHATSAPP_BOT_NUMBER || '').replace(/\D/g, '');

    if (botNumber && safeCode) {
      // Le bot reconnaît le code et répond avec la fiche complète (nom, prix,
      // description…) : inutile de mettre le nom ici, on garde le message court.
      const text = `Bonjour 👋 Pour acheter ce produit (code ${safeCode}) en toute sécurité avec Validèl, appuyez sur Envoyer pour commencer.`;
      window.location.replace(`https://wa.me/${botNumber}?text=${encodeURIComponent(text)}`);
    } else if (safeCode) {
      // Repli si le numéro du bot n'est pas configuré : page produit web.
      window.location.replace(`/product/${encodeURIComponent(safeCode)}`);
    } else {
      window.location.replace('/');
    }
  }, [code]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, color: '#374151' }}>
      Redirection vers WhatsApp…
    </div>
  );
};

export default ProductGoRedirect;
