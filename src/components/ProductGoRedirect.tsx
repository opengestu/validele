import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

// = WHATSAPP_BOT_NUMBER / VITE_WHATSAPP_BOT_NUMBER. Valeur en dur comme ultime
// filet : garantit qu'on part TOUJOURS vers le bot, jamais vers un repli web
// (/ ou /product) qui, non connecté, renverrait ensuite vers /auth.
const FALLBACK_BOT_NUMBER = '221768171175';

// Lien de partage propre et rassurant : le vendeur partage
// https://www.validel.shop/acheter/{code} (branché Validèl, pas un long lien
// wa.me encodé qui fait "louche"). Ce composant redirige aussitôt vers le bot
// WhatsApp Validèl, code produit pré-rempli, prêt à envoyer.
//
// NB : en pratique, le script inline en tête de index.html redirige déjà AVANT
// que React ne se charge. Ce composant n'est qu'un filet de sécurité.
const ProductGoRedirect = () => {
  const { code } = useParams<{ code?: string }>();

  useEffect(() => {
    const safeCode = String(code || '').trim();
    // Numéro connu au build, sinon valeur en dur : toujours disponible, aucun
    // appel réseau -> redirection instantanée et fiable vers le bot.
    const botNumber = String(import.meta.env.VITE_WHATSAPP_BOT_NUMBER || '').replace(/\D/g, '') || FALLBACK_BOT_NUMBER;

    if (safeCode && botNumber) {
      // Le bot reconnaît le code et répond avec la fiche complète (nom, prix…).
      const text = `Bonjour 👋 Pour acheter ce produit (code ${safeCode}) en toute sécurité avec Validèl, appuyez sur Envoyer pour commencer.`;
      window.location.replace(`https://wa.me/${botNumber}?text=${encodeURIComponent(text)}`);
    } else if (safeCode) {
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
