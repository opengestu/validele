// Service pour envoyer des notifications push via le backend
import { apiUrl } from '@/lib/api';

interface NotifyResult {
  success: boolean;
  sent?: boolean;
  error?: string;
}

/**
 * Notifier le vendeur d'une nouvelle commande
 */
export async function notifyVendorNewOrder(
  vendorId: string,
  orderId: string,
  buyerName: string,
  productName: string,
  amount: number
): Promise<NotifyResult> {
  try {
    const response = await fetch(apiUrl('/api/notify/new-order'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId, orderId, buyerName, productName, amount })
    });
    return await response.json();
  } catch (error) {
    console.error('[NOTIFY] Erreur new-order:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Notifier l'acheteur que sa commande est confirmée/payée
 */
export async function notifyBuyerOrderConfirmed(
  buyerId: string,
  orderId: string,
  orderCode?: string
): Promise<NotifyResult> {
  try {
    const response = await fetch(apiUrl('/api/notify/order-confirmed'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyerId, orderId, orderCode })
    });
    return await response.json();
  } catch (error) {
    console.error('[NOTIFY] Erreur order-confirmed:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Notifier le livreur qu'une commande lui est assignée
 */
export async function notifyDeliveryPersonAssigned(
  deliveryPersonId: string,
  orderId: string,
  deliveryAddress: string,
  productName: string
): Promise<NotifyResult> {
  try {
    const response = await fetch(apiUrl('/api/notify/delivery-assigned'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deliveryPersonId, orderId, deliveryAddress, productName })
    });
    return await response.json();
  } catch (error) {
    console.error('[NOTIFY] Erreur delivery-assigned:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Notifier l'acheteur que la livraison est en cours
 */
export async function notifyBuyerDeliveryStarted(
  buyerId: string,
  orderId: string,
  orderCode?: string
): Promise<NotifyResult> {
  try {
    const response = await fetch(apiUrl('/api/notify/delivery-started'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyerId, orderId, orderCode })
    });
    return await response.json();
  } catch (error) {
    console.error('[NOTIFY] Erreur delivery-started:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Notifier la fin de livraison (vendeur + acheteur)
 */
export async function notifyDeliveryCompleted(
  vendorId: string,
  buyerId: string,
  orderId: string,
  orderCode?: string
): Promise<NotifyResult> {
  try {
    const response = await fetch(apiUrl('/api/notify/delivery-completed'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId, buyerId, orderId, orderCode })
    });
    return await response.json();
  } catch (error) {
    console.error('[NOTIFY] Erreur delivery-completed:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Envoyer la notification de bienvenue (1ère ouverture)
 */
export async function notifyWelcome(token: string): Promise<NotifyResult> {
  try {
    const response = await fetch(apiUrl('/api/notify/welcome'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    return await response.json();
  } catch (error) {
    console.error('[NOTIFY] Erreur welcome:', error);
    return { success: false, error: (error as Error).message };
  }
}
