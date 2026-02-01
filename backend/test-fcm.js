const { isFirebaseConfigured, getAccessToken, sendPushNotification } = require('./firebase-push');

(async () => {
  console.log('Configured?', isFirebaseConfigured());
  try {
    const token = await getAccessToken();
    console.log('Access token ok:', !!token);
  } catch (e) {
    console.error('Erreur getAccessToken:', e.message || e);
  }

  // If you set TEST_FCM_TOKEN env var, attempt to send a test push
  const testToken = process.env.TEST_FCM_TOKEN;
  if (testToken) {
    try {
      const res = await sendPushNotification(testToken, 'Test push', 'Message de test depuis le serveur', { test: '1' });
      console.log('Push envoyé, result:', res);
    } catch (e) {
      console.error('Erreur envoi push:', e.message || e);
    }
  } else {
    console.log('Aucun TEST_FCM_TOKEN défini, envoi de push ignoré.');
  }
})();