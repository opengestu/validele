import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiUrl } from '@/lib/api';

// Lien de partage propre et rassurant : le vendeur partage
// https://www.validel.shop/acheter/{code} (branché Validèl, pas un long lien
// wa.me encodé qui fait "louche"). Ce composant redirige aussitôt vers le bot
// WhatsApp Validèl, code produit pré-rempli, prêt à envoyer.
const ProductGoRedirect = () => {
  const { code } = useParams<{ code?: string }>();

  useEffect(() => {
    const safeCode = String(code || '').trim();
    // Le bot reconnaît le code et répond avec la fiche complète (nom, prix…) :
    // inutile de mettre le nom ici, on garde le message court.
    const text = `Bonjour 👋 Pour acheter ce produit (code ${safeCode}) en toute sécurité avec Validèl, appuyez sur Envoyer pour commencer.`;
    const goToBot = (botNumber: string) => {
      window.location.replace(`https://wa.me/${botNumber}?text=${encodeURIComponent(text)}`);
    };

    // 1) Numéro connu au build (VITE_WHATSAPP_BOT_NUMBER) -> redirection INSTANTANÉE,
    // sans appel réseau. C'est ce qui évite que l'onglet réutilisé affiche encore
    // l'ancienne page (ex. une page PixPay) le temps d'un aller-retour serveur.
    const buildNumber = String(import.meta.env.VITE_WHATSAPP_BOT_NUMBER || '').replace(/\D/g, '');
    if (buildNumber && safeCode) { goToBot(buildNumber); return; }

    // 2) Sinon seulement, on demande le numéro au backend (WHATSAPP_BOT_NUMBER sur
    // Render), puis on redirige. Repli ultime : page produit web.
    (async () => {
      let botNumber = '';
      try {
        const resp = await fetch(apiUrl('/api/config/whatsapp-bot'));
        const json: any = await resp.json().catch(() => null);
        botNumber = String(json?.botNumber || '').replace(/\D/g, '');
      } catch { /* réseau indisponible -> repli ci-dessous */ }

      if (botNumber && safeCode) { goToBot(botNumber); return; }
      if (safeCode) { window.location.replace(`/product/${encodeURIComponent(safeCode)}`); return; }
      window.location.replace('/');
    })();
  }, [code]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, color: '#374151' }}>
      Redirection vers WhatsApp…
    </div>
  );
};

export default ProductGoRedirect;
