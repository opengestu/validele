import express from 'express';
import { updateTransactionStatus } from '../services/db';

const router = express.Router();

// Certains fournisseurs (comme PayDunya) vérifient l’accessibilité du callback
// via une requête GET/HEAD avant d’envoyer les notifications POST.
// On répond 200 pour ces méthodes afin d’éviter l’erreur "the callback is not accessible".
router.get('/api/paydunya/notification', (req, res) => {
  console.log('[WEBHOOK] GET /api/paydunya/notification – ping reçu');
  res.status(200).json({ success: true, message: 'Callback reachable' });
});

router.head('/api/paydunya/notification', (req, res) => {
  console.log('[WEBHOOK] HEAD /api/paydunya/notification – ping reçu');
  res.status(200).end();
});

router.post('/api/paydunya/notification', async (req, res) => {
  try {
    const notification = req.body;
    console.log('[WEBHOOK] Notification PayDunya reçue :', notification);
    // Extraire les infos nécessaires (à adapter selon le format exact PayDunya)
    const { transaction_id, status } = notification;
    if (transaction_id && status) {
      console.log(`[WEBHOOK] Mise à jour du statut de la transaction ${transaction_id} à ${status}`);
      await updateTransactionStatus(transaction_id, status);
    } else {
      console.warn('[WEBHOOK] Notification incomplète, transaction_id ou status manquant');
    }
    res.status(200).json({ success: true });
  } catch (err: unknown) {
    let errorMessage = 'Erreur inconnue';
    if (err instanceof Error) {
      errorMessage = err.message;
    }
    console.error('[WEBHOOK] Exception dans /api/paydunya/notification:', errorMessage, err);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

export default router; 