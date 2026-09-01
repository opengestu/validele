import React from 'react';
import { useParams } from 'react-router-dom';
import { ImageOff, ShieldCheck, Store } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { supabase } from '@/integrations/supabase/client';
import { buildBotShareLink } from '@/lib/whatsappBot';
import { cn } from '@/lib/utils';

// Page PUBLIQUE du catalogue d'une boutique : /boutique/{shopCode}.
//
// Aucune authentification, aucun état d'app : c'est la page qu'un vendeur
// partage sur WhatsApp/Facebook et qu'un inconnu ouvre depuis son téléphone.
// Elle lit uniquement ce que la policy anon autorise (migration 010) :
// profiles(id, company_name, shop_code) + produits disponibles.
//
// Chaque bouton « Acheter » ouvre le bot WhatsApp avec le code produit
// pré-rempli — le MÊME parcours que le lien /acheter/{code}. On appelle ici
// wa.me directement plutôt que de passer par la redirection 302 serveur :
// celle-ci n'existe que pour raccourcir une URL *partagée*, or ici le visiteur
// est déjà dans un navigateur et l'URL du bouton n'est jamais visible.

type ShopProduct = {
  id: string;
  name: string;
  price: number;
  code: string;
  description: string | null;
  image_url: string | null;
};

type Shop = {
  id: string;
  name: string;
  shopCode: string;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error' }
  | { status: 'ready'; shop: Shop; products: ShopProduct[] };

const formatFcfa = (value: number) => Number(value || 0).toLocaleString('fr-FR');

const ProductThumb: React.FC<{ product: ShopProduct }> = ({ product }) => {
  const [failed, setFailed] = React.useState(false);

  if (!product.image_url || failed) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <ImageOff className="h-7 w-7" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      src={product.image_url}
      alt={product.name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="aspect-square w-full rounded-2xl object-cover"
    />
  );
};

const CatalogShell: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('min-h-[100svh] bg-background text-foreground', className)}>{children}</div>
);

const ShopCatalog: React.FC = () => {
  const { shopCode } = useParams<{ shopCode?: string }>();
  const [state, setState] = React.useState<LoadState>({ status: 'loading' });

  const normalizedCode = String(shopCode || '').trim().toUpperCase();

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setState({ status: 'loading' });

      if (!normalizedCode) {
        if (!cancelled) setState({ status: 'not-found' });
        return;
      }

      try {
        const { data: shopRow, error: shopError } = await supabase
          .from('profiles')
          .select('id, company_name, shop_code')
          .eq('shop_code', normalizedCode)
          .maybeSingle();

        if (cancelled) return;
        if (shopError) {
          console.error('[ShopCatalog] lecture boutique échouée', shopError);
          setState({ status: 'error' });
          return;
        }
        if (!shopRow) {
          setState({ status: 'not-found' });
          return;
        }

        const { data: productRows, error: productsError } = await supabase
          .from('products')
          .select('id, name, price, code, description, image_url')
          .eq('vendor_id', shopRow.id)
          .eq('is_available', true)
          // Le catalogue de démonstration n'a rien à faire sur une vitrine
          // publique : un vrai client ne doit pas pouvoir commander un décor.
          .not('is_demo', 'is', true)
          .order('created_at', { ascending: false });

        if (cancelled) return;
        if (productsError) {
          console.error('[ShopCatalog] lecture produits échouée', productsError);
          setState({ status: 'error' });
          return;
        }

        setState({
          status: 'ready',
          shop: {
            id: shopRow.id,
            // company_name est le nom d'enseigne saisi à l'inscription. Le nom
            // personnel du vendeur n'est volontairement pas lisible en anon.
            name: String(shopRow.company_name || '').trim() || 'Boutique Validèl',
            shopCode: String(shopRow.shop_code || normalizedCode),
          },
          products: (productRows || []).map((p) => ({
            id: p.id,
            name: p.name,
            price: Number(p.price) || 0,
            code: String(p.code || ''),
            description: p.description,
            image_url: p.image_url,
          })),
        });
      } catch (err) {
        if (cancelled) return;
        console.error('[ShopCatalog] erreur inattendue', err);
        setState({ status: 'error' });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [normalizedCode]);

  React.useEffect(() => {
    if (state.status !== 'ready') return;
    const previous = document.title;
    document.title = `${state.shop.name} · Validèl`;
    return () => {
      document.title = previous;
    };
  }, [state]);

  if (state.status === 'loading') {
    return (
      <CatalogShell className="flex items-center justify-center">
        <Spinner size="sm" />
      </CatalogShell>
    );
  }

  if (state.status !== 'ready') {
    const isError = state.status === 'error';
    return (
      <CatalogShell className="flex items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-[1.25rem] bg-muted text-muted-foreground">
            <Store className="h-7 w-7" strokeWidth={1.5} />
          </div>
          <h1 className="font-heading text-xl font-bold tracking-tight">
            {isError ? 'Catalogue indisponible' : 'Boutique introuvable'}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {isError
              ? 'Nous n\'avons pas pu charger ce catalogue. Réessayez dans un instant.'
              : `Aucune boutique Validèl ne correspond au code ${normalizedCode || 'demandé'}. Vérifiez le lien reçu du vendeur.`}
          </p>
        </div>
      </CatalogShell>
    );
  }

  const { shop, products } = state;

  return (
    <CatalogShell>
      <header className="border-b border-border px-6 pb-6 pt-[calc(env(safe-area-inset-top,0px)+2rem)]">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem] bg-primary text-primary-foreground shadow-premium">
              <Store className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-heading text-2xl font-bold leading-tight tracking-tight">
                {shop.name}
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {products.length === 0
                  ? 'Catalogue Validèl'
                  : `${products.length} produit${products.length > 1 ? 's' : ''} disponible${products.length > 1 ? 's' : ''}`}
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-border bg-muted/50 px-4 py-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-foreground" strokeWidth={1.75} />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Paiement protégé par Validèl : le vendeur n'est payé qu'après votre confirmation de réception.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-[calc(env(safe-area-inset-bottom,0px)+3rem)] pt-6">
        {products.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Cette boutique n'a aucun produit en vente pour l'instant.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {products.map((product) => (
              <li
                key={product.id}
                className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card p-3 transition-shadow hover:shadow-premium"
              >
                <ProductThumb product={product} />

                <h2 className="mt-3 line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                  {product.name}
                </h2>
                <div className="mt-1 font-heading text-base font-bold text-foreground">
                  {formatFcfa(product.price)}{' '}
                  <span className="text-xs font-medium text-muted-foreground">CFA</span>
                </div>

                <Button
                  asChild
                  size="sm"
                  className="mt-3 h-10 w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {/* rel="noopener" : wa.me est une origine tierce. */}
                  <a href={buildBotShareLink(product.code)} rel="noopener noreferrer">
                    Acheter
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Boutique {shop.shopCode} · propulsée par Validèl
        </p>
      </main>
    </CatalogShell>
  );
};

export default ShopCatalog;
