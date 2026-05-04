import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Confetti from 'react-confetti';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { getProfileById } from '@/lib/api';
const validelLogo = '/icons/validel-logo.svg';

const PaymentSuccess = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [order, setOrder] = React.useState<any | null>(null);
  const [buyer, setBuyer] = React.useState<any | null>(null);
  const [product, setProduct] = React.useState<any | null>(null);
  const [debugInfo, setDebugInfo] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const confettiRef = useRef(null);
  const pollRef = useRef<number | null>(null);
  const pollAttemptsRef = useRef(0);

  // Récupère l'order_id dans l'URL (query string)
  const params = new URLSearchParams(location.search);
  const orderId = params.get('order_id');

  const isPaid = order?.status === 'paid' || order?.status === 'in_delivery' || order?.status === 'delivered';

  const fetchAll = React.useCallback(async () => {
      if (!orderId) {
        setError("Aucun order_id fourni dans l'URL.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      // 1. Récupère la commande (DB) — fallback to dev/test fake order stored in localStorage
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      const smsSessionStr = typeof window !== 'undefined' ? localStorage.getItem('sms_auth_session') : null;
      const smsProfileId = smsSessionStr ? (JSON.parse(smsSessionStr || '{}')?.profileId || '') : '';
      const sessionId = smsProfileId || '';
      const isDevSession = sessionId.startsWith('dev-') || sessionId.includes('777693020');
      const isTestEnv = (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') || (typeof window !== 'undefined' && (window as any).Cypress);
      const isTestOrderId = !!orderId && (orderId.startsWith('test-order-') || orderId.startsWith('dev-order-'));

      if (orderError || !orderData) {
        // If this is a dev/test session or a test order id, try to show a local fake order instead
        if (isDevSession || isTestEnv || isTestOrderId) {
          let local: any = null;
          try {
            const raw = localStorage.getItem(`dev_order_${orderId}`);
            if (raw) local = JSON.parse(raw);
          } catch (e) { local = null; }

          if (!local) {
            // synthesize a minimal fake order for display
            local = {
              id: orderId,
              buyer_id: sessionId || `dev-buyer-777693020`,
              vendor_id: 'dev-vendor-777693020',
              product_id: 'dev-prod-1',
              total_amount: 1200,
              payment_method: 'wave',
              delivery_address: '',
              buyer_phone: '+221777693020',
              order_code: `TEST-${String(Math.floor(Math.random() * 900000) + 100000)}`,
              qr_code: 'dev-qr-buyer-1',
              status: 'paid',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              products: { name: 'Produit démo — Maïs' },
              profiles: { company_name: 'Boutique Dev', full_name: 'Dev Vendeur' }
            };
          }
          setOrder(local);
          setBuyer({ full_name: sessionId || 'Dev Buyer', email: `${sessionId || 'dev-buyer'}@sms.validele.app` });
          if (local) setProduct({ name: local.products?.name || 'Produit démo', price: local.total_amount });
          setLoading(false);
          return;
        }

        setError("Commande introuvable ou erreur de chargement.");
        setOrder(null);
        setLoading(false);
        return;
      }
      setOrder(orderData);
      // 2. Récupère le profil acheteur
      let buyerData: any = null;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', orderData.buyer_id)
          .single();
        if (!error) {
          buyerData = data;
        }
      } catch (e) {
        console.warn('[PaymentSuccess] supabase get buyer profile failed, will try backend admin', e);
      }

      if (!buyerData) {
        try {
          const { ok, json, url } = await getProfileById(orderData.buyer_id);
          console.log('[PaymentSuccess] getProfileById result', { ok, url });
          if (ok) buyerData = json?.profile ?? json;
        } catch (e) {
          console.warn('[PaymentSuccess] backend get profile failed', e);
        }
      }
      setBuyer(buyerData);
      // 3. Récupère le produit
      const { data: productData } = await supabase
        .from('products')
        .select('name, price')
        .eq('id', orderData.product_id)
        .single();
      setProduct(productData);
      setLoading(false);
    }, [orderId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!orderId || !order || isPaid) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    if (pollRef.current) return;

    pollAttemptsRef.current = 0;
    pollRef.current = window.setInterval(async () => {
      pollAttemptsRef.current += 1;
      const { data } = await supabase
        .from('orders')
        .select('status, payment_confirmed_at, updated_at')
        .eq('id', orderId)
        .single();

      if (data) {
        setOrder((prev: any) => (prev ? { ...prev, ...data } : prev));
      }

      const nextStatus = data?.status;
      const paidNow = nextStatus === 'paid' || nextStatus === 'in_delivery' || nextStatus === 'delivered';
      if (paidNow || pollAttemptsRef.current >= 36) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    }, 5000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [orderId, order, isPaid]);

  const handleDownloadInvoice = async () => {
    if (!order) return;
    const doc = new jsPDF();
    // Ajout du logo Validèl (doit être en base64 ou accessible en import)
    try {
      const img = new window.Image();
      img.src = validelLogo;
      await new Promise((resolve) => { img.onload = resolve; });
      doc.addImage(img, 'PNG', 20, 10, 40, 20);
    } catch (e) {
      // Si le logo ne charge pas, on continue sans
    }
    doc.setFontSize(18);
    doc.text('Reçu de paiement', 70, 35);
    doc.setFontSize(12);
    doc.text(`Commande n°: ${order.order_code || order.id}`, 20, 55);
    doc.text(`Client: ${buyer?.full_name || ''}`, 20, 65);
    doc.text(`Email: ${buyer?.email || ''}`, 20, 75);
    // Tableau des détails
    doc.text('Détails du produit:', 20, 85);
    // @ts-ignore
    doc.autoTable({
      startY: 90,
      head: [['Produit', 'Prix unitaire (FCFA)', 'Quantité', 'Total (FCFA)']],
      body: [
        [
          product?.name || '-',
          product?.price ? product.price.toLocaleString() : (order.total_amount / (order.quantity ?? 1)).toLocaleString(),
          order.quantity ?? 1,
          order.total_amount ? Number(order.total_amount).toLocaleString() : '0'
        ]
      ],
    });
    // @ts-ignore
    const finalY = doc.lastAutoTable?.finalY || 120;
    doc.text(`Statut: payée`, 20, finalY + 10);
    doc.text(`Date: ${new Date(order.payment_confirmed_at || order.updated_at).toLocaleString()}`, 20, finalY + 20);
    doc.text('Merci pour votre confiance !', 20, finalY + 35);
    doc.save(`facture-commande-${order.order_code || order.id}.pdf`);
  };

  const handleGoToDashboard = () => {
    navigate('/buyer');
  };

  const handleRefresh = async () => {
    await fetchAll();
  };

  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        padding: '20px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Chargement du paiement...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1f2937 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        padding: '20px'
      }}>
        <div style={{
          background: 'white',
          borderRadius: 20,
          padding: '40px 32px',
          maxWidth: 520,
          width: '95%',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)'
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Paiement introuvable</h1>
          <p style={{ color: '#64748b', marginBottom: 24 }}>{error}</p>
          <Button onClick={handleGoToDashboard} style={{ width: '100%' }}>
            Retour au tableau de bord
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      width: '100vw', 
      height: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      padding: '20px',
      overflow: 'auto'
    }}>
      {isPaid && (
        <Confetti numberOfPieces={350} recycle={false} width={window.innerWidth} height={window.innerHeight} ref={confettiRef} />
      )}
      <div style={{ 
        background: 'white', 
        borderRadius: 24, 
        boxShadow: '0 25px 80px rgba(0,0,0,0.35)', 
        padding: '64px 48px', // Augmente le padding
        textAlign: 'center', 
        maxWidth: 600, // Augmente la largeur max
        width: '95%',
        margin: 'auto'
      }}>
        <div style={{ fontSize: 120, marginBottom: 32, animation: 'bounce 1s ease-in-out' }}>
          {isPaid ? '✓' : '⏳'}
        </div>
        <h1 style={{ 
          fontSize: 48, // Plus grand
          fontWeight: 900, 
          background: isPaid
            ? 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)'
            : 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)', 
          WebkitBackgroundClip: 'text', 
          WebkitTextFillColor: 'transparent', 
          marginBottom: 24,
          letterSpacing: '-1px'
        }}>
          {isPaid ? 'Paiement réussi !' : 'Paiement en cours'}
        </h1>
        <p style={{ 
          fontSize: 22, // Plus grand
          color: '#64748b', 
          lineHeight: 1.7, 
          marginBottom: 40,
          fontWeight: 600
        }}>
          {isPaid ? (
            <>
              Merci pour votre commande.<br />
              <span style={{ fontSize: 18, color: '#94a3b8' }}>Votre paiement a été confirmé avec succès !</span>
            </>
          ) : (
            <>
              Nous attendons la confirmation du paiement.<br />
              <span style={{ fontSize: 18, color: '#94a3b8' }}>Cette page se mettra à jour automatiquement.</span>
            </>
          )}
        </p>
        {isPaid ? (
          <Button 
            onClick={handleDownloadInvoice} 
            disabled={!order}
            style={{ 
              width: '100%', 
              background: '#16a34a', 
              color: 'white', 
              fontWeight: 800, 
              fontSize: 20, // Plus grand
              padding: '18px 32px',
              borderRadius: 16,
              border: 'none',
              cursor: order ? 'pointer' : 'not-allowed',
              boxShadow: '0 8px 24px rgba(34, 197, 94, 0.25)',
              transition: 'all 0.3s',
              opacity: order ? 1 : 0.5,
              letterSpacing: '0.5px',
              marginBottom: 24
            }}
          >
            📄 Télécharger la facture
          </Button>
        ) : (
          <Button
            onClick={handleRefresh}
            style={{
              width: '100%',
              background: '#f59e0b',
              color: 'white',
              fontWeight: 800,
              fontSize: 20,
              padding: '18px 32px',
              borderRadius: 16,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(245, 158, 11, 0.25)',
              transition: 'all 0.3s',
              letterSpacing: '0.5px',
              marginBottom: 24
            }}
          >
            🔄 Rafraîchir le statut
          </Button>
        )}
        <Button
          onClick={handleGoToDashboard}
          style={{
            width: '100%',
            background: '#2563eb',
            color: 'white',
            fontWeight: 700,
            fontSize: 18,
            padding: '16px 28px',
            borderRadius: 14,
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(37, 99, 235, 0.18)',
            transition: 'all 0.3s',
            letterSpacing: '0.3px',
            marginBottom: 10
          }}
        >
          🏠 Retour au tableau de bord
        </Button>
      </div>
    </div>
  );
};

export default PaymentSuccess;