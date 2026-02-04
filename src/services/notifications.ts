// Service pour envoyer des notifications push via le backend
import { apiUrl, safeJson } from '@/lib/api';

interface NotifyResult {
  success: boolean;
  sent?: boolean;
  error?: string;
}

async function postNotify(path: string, payload: Record<string, unknown>): Promise<NotifyResult> {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const parsed = await safeJson(response);
  if (parsed && typeof parsed === 'object' && '__parseError' in parsed) {
    return { success: false, error: 'Réponse invalide du serveur (JSON attendu).' };
  }

  const result = (parsed ?? {}) as any;

  if (!response.ok) {
    return { success: false, error: result?.error || result?.message || `Erreur serveur (${response.status})` };
  }

  return result as NotifyResult;
}

/**
 * Notifier le Vendeur(se) d'une nouvelle commande
 */
export async function notifyVendorNewOrder(
  vendorId: string,
  orderId: string,
  buyerName: string,
  productName: string,
  amount: number
): Promise<NotifyResult> {
  try {
    return await postNotify('/api/notify/new-order', { vendorId, orderId, buyerName, productName, amount });
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
    return await postNotify('/api/notify/order-confirmed', { buyerId, orderId, orderCode });
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
    return await postNotify('/api/notify/delivery-assigned', { deliveryPersonId, orderId, deliveryAddress, productName });
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
  orderCode?: string,
  deliveryPersonPhone?: string
): Promise<NotifyResult> {
  try {
    const payload: Record<string, unknown> = { buyerId, orderId, orderCode };
    if (deliveryPersonPhone) payload.deliveryPersonPhone = deliveryPersonPhone;

    return await postNotify('/api/notify/delivery-started', payload);
  } catch (error) {
    console.error('[NOTIFY] Erreur delivery-started:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Notifier la fin de livraison (vendeur(se) + acheteur)
 */
export async function notifyDeliveryCompleted(
  vendorId: string,
  buyerId: string,
  orderId: string,
  orderCode?: string
): Promise<NotifyResult> {
  try {
    return await postNotify('/api/notify/delivery-completed', { vendorId, buyerId, orderId, orderCode });
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
    return await postNotify('/api/notify/welcome', { token });
  } catch (error) {
    console.error('[NOTIFY] Erreur welcome:', error);
    return { success: false, error: (error as Error).message };
  }
}
