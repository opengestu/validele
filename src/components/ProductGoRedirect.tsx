import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { buildBotShareLink } from '@/lib/whatsappBot';

// Filet de sécurité pour les anciens liens /acheter/{code} déjà partagés.
// En pratique, la redirection se fait AVANT React : d'abord la Pages Function
// (302 serveur), sinon le script inline d'index.html. Ce composant ne sert que
// si ces deux couches ont été contournées. Numéro + message : src/lib/whatsappBot.ts.
const ProductGoRedirect = () => {
  const { code } = useParams<{ code?: string }>();

  useEffect(() => {
    const safeCode = String(code || '').trim();
    if (safeCode) {
      // Toujours vers le bot (numéro en dur en repli) : jamais de détour par
      // une page web qui, non connecté, renverrait vers /auth.
      window.location.replace(buildBotShareLink(safeCode));
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
