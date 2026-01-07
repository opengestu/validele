import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Channel } from '@capacitor/push-notifications';
import { useAuth } from '@/hooks/useAuth';
import { Dialog } from '@capacitor/dialog';
import { supabase } from '@/integrations/supabase/client';
import { notifyWelcome } from '@/services/notifications';

/**
 * Composant qui initialise les notifications push après connexion.
 */
const PushNotificationSetup = () => {
  const { user } = useAuth();
  const [initialized, setInitialized] = useState(false);

  const WELCOME_SENT_KEY = 'validel_welcome_notif_sent_v1';
  const LAST_TOKEN_KEY = 'validel_last_fcm_token_v1';

  // Fonction pour sauvegarder le token dans Supabase
  const saveTokenToSupabase = async (token: string, userId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ push_token: token })
        .eq('id', userId);

      if (error) {
        console.error('Erreur sauvegarde token:', error);
      } else {
        console.log('✅ Token FCM sauvegardé dans Supabase');
      }
    } catch (err) {
      console.error('Erreur sauvegarde token:', err);
    }
  };

  useEffect(() => {
    const platform = Capacitor.getPlatform();

    // Ne rien faire sur web
    if (platform === 'web' || initialized) {
      return;
    }

    const initPush = async () => {
      try {
        // Créer le canal de notification pour Android 8+
        const channel: Channel = {
          id: 'fcm_default_channel',
          name: 'Notifications Validèl',
          description: 'Notifications de l\'application Validèl',
          importance: 5,
          visibility: 1,
          sound: 'default',
          vibration: true,
        };

        try {
          await PushNotifications.createChannel(channel);
        } catch (channelErr) {
          console.log('Canal peut-être déjà existant:', channelErr);
        }

        // Si on a déjà un token en cache et que le welcome n'a pas été envoyé,
        // tenter l'envoi sans attendre un nouvel événement 'registration'.
        try {
          const cachedToken = localStorage.getItem(LAST_TOKEN_KEY);
          if (cachedToken && !localStorage.getItem(WELCOME_SENT_KEY)) {
            const res = await notifyWelcome(cachedToken);
            if (res?.success) {
              localStorage.setItem(WELCOME_SENT_KEY, '1');
            }
          }
        } catch (e) {
          console.warn('Welcome notification (cached token) failed:', e);
        }

        // Vérifier/demander la permission
        const permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive !== 'granted') {
          const req = await PushNotifications.requestPermissions();
          if (req.receive !== 'granted') {
            console.warn('Push permission refusée');
            return;
          }
        }

        // S'enregistrer auprès de FCM
        await PushNotifications.register();

        // Écouter le token
        PushNotifications.addListener('registration', async (token) => {
          console.log('🔔 Token FCM:', token.value);

          // Garder une copie locale du token pour retry si besoin
          try {
            localStorage.setItem(LAST_TOKEN_KEY, token.value);
          } catch (e) {
            console.warn('Cannot persist last FCM token:', e);
          }

          // Sauvegarder le token dans Supabase
          if (user?.id) {
            await saveTokenToSupabase(token.value, user.id);
          }

          // Envoyer une notification de bienvenue une seule fois (par appareil)
          try {
            if (!localStorage.getItem(WELCOME_SENT_KEY)) {
              const res = await notifyWelcome(token.value);
              if (res?.success) {
                localStorage.setItem(WELCOME_SENT_KEY, '1');
              }
            }
          } catch (e) {
            console.warn('Welcome notification failed:', e);
          }
        });

        PushNotifications.addListener('registrationError', (err) => {
          console.error('Erreur enregistrement push:', err);
        });

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('📬 Notification reçue (foreground):', notification);
          // Afficher une alerte quand l'app est au premier plan
          Dialog.alert({
            title: notification.title || 'Notification',
            message: notification.body || '',
          });
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
          console.log('📬 Action sur notification:', event);
        });

        setInitialized(true);
      } catch (err) {
        console.error('Erreur init push:', err);
      }
    };

    // Délai pour s'assurer que l'app est bien chargée
    const timer = setTimeout(() => {
      initPush();
    }, 2000);

    return () => clearTimeout(timer);
  }, [user, initialized]);

  return null;
};

export default PushNotificationSetup;
