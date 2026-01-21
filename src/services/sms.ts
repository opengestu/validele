// ...existing code...

/**
 * Envoie un SMS au client pour l'informer que la commande est en cours de livraison
 * @param clientPhone Numéro du client (format international)
 * @param livreurPhone Numéro du livreur (format international)
 */
export async function notifyDelivery(clientPhone: string, livreurPhone: string) {
  const message = `Votre commande est en cours de livraison. Voici le numéro du livreur : ${livreurPhone}`;
  // Exemple avec Direct7Networks
  await sendSMS(clientPhone, message);
}

// Fonction générique d'envoi de SMS (à adapter selon votre API SMS)
export async function sendSMS(phone: string, message: string) {
  // Remplacez cette partie par l'appel à votre API SMS réelle
  await fetch('https://api.direct7networks.com/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: phone, text: message })
  });
}

// ...existing code...
