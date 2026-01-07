import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Confetti from 'react-confetti';
import jsPDF from 'jspdf';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import validelLogo from '@/assets/validel-logo.png';
import { notifyVendorNewOrder } from '@/services/notifications';

const PaymentSuccess = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [order, setOrder] = React.useState(null);
  const [buyer, setBuyer] = React.useState(null);
  const [product, setProduct] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const confettiRef = useRef(null);

  // Récupère l'order_id dans l'URL (query string)
  const params = new URLSearchParams(location.search);
  const orderId = params.get('order_id');

  useEffect(() => {
    const fetchAll = async () => {
      if (!orderId) {
        setError("Aucun order_id fourni dans l'URL.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      // 1. Récupère la commande
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();
      if (orderError || !orderData) {
        setError("Commande introuvable ou erreur de chargement.");
        setOrder(null);
        setLoading(false);
        return;
      }
      setOrder(orderData);
      // 2. Récupère le profil acheteur
      const { data: buyerData } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', orderData.buyer_id)
        .single();
      setBuyer(buyerData);
      // 3. Récupère le produit
      const { data: productData } = await supabase
        .from('products')
        .select('name, price')
        .eq('id', orderData.product_id)
        .single();
      setProduct(productData);
      setLoading(false);
    };
    fetchAll();
  }, [orderId]);

  useEffect(() => {
    const updateOrderStatus = async () => {
      if (!orderId) return;
      // Met à jour le statut de la commande à 'paid' si ce n'est pas déjà fait
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('status, vendor_id, buyer_id, total_amount, order_code, product_id')
        .eq('id', orderId)
        .single();
      if (!orderError && orderData && orderData.status !== 'paid') {
        await supabase
          .from('orders')
          .update({ status: 'paid' })
          .eq('id', orderId);
        
        // Récupérer le nom du produit et de l'acheteur pour la notification
        const [productRes, buyerRes] = await Promise.all([
          supabase.from('products').select('name').eq('id', orderData.product_id).single(),
          supabase.from('profiles').select('full_name').eq('id', orderData.buyer_id).single()
        ]);
        
        // Notifier le vendeur de la nouvelle commande payée
        notifyVendorNewOrder(
          orderData.vendor_id,
          orderId,
          buyerRes.data?.full_name || 'Client',
          productRes.data?.name || 'Produit',
          orderData.total_amount
        ).catch(err => console.warn('Notification vendeur échouée:', err));
      }
    };
    updateOrderStatus();
  }, [orderId]);

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
    doc.text(`Produit: ${product?.name || ''}`, 20, 85);
    doc.text(`Montant: ${order.total_amount} FCFA`, 20, 95);
    doc.text(`Statut: payée`, 20, 105); // Toujours 'payée' en français
    doc.text(`Date: ${new Date(order.payment_confirmed_at || order.updated_at).toLocaleString()}`, 20, 115);
    doc.text('Merci pour votre confiance !', 20, 135);
    doc.save(`facture-commande-${order.order_code || order.id}.pdf`);
  };

  const handleGoToDashboard = () => {
    navigate('/buyer');
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: '#f7fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <Confetti numberOfPieces={350} recycle={false} width={window.innerWidth} height={window.innerHeight} ref={confettiRef} />
      <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 4px 24px #0001', padding: 40, textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#2d7a46', marginBottom: 12 }}>Paiement réussi !</h1>
        {loading ? (
          <p style={{ fontSize: 18, marginBottom: 24 }}>Chargement de la commande...</p>
        ) : error ? (
          <>
            <p style={{ color: 'red', fontSize: 16, marginBottom: 24 }}>{error}</p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 8 }}>
              <Button onClick={handleGoToDashboard} variant="default">Retour au tableau de bord</Button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 18, marginBottom: 24 }}>Votre paiement a été confirmé.<br />Merci pour votre confiance.</p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 8 }}>
              <Button onClick={handleDownloadInvoice} disabled={!order} variant="outline">Télécharger la facture</Button>
              <Button onClick={handleGoToDashboard} variant="default">Retour au tableau de bord</Button>
            </div>
            {order && (
              <div style={{ marginTop: 24, fontSize: 14, color: '#888' }}>
                Montant: <b>{order.total_amount} FCFA</b>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PaymentSuccess; 