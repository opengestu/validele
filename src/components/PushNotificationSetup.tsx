import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Channel } from '@capacitor/push-notifications';
import { useAuth } from '@/hooks/useAuth';
import { Dialog } from '@capacitor/dialog';
import { supabase } from '@/integrations/supabase/client';
import { notifyWelcome } from '@/services/notifications';
import { apiUrl, postProfileUpdate } from '@/lib/api';

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
      const smsSessionStr = typeof window !== 'undefined' ? localStorage.getItem('sms_auth_session') : null;
      if (smsSessionStr) {
        // SMS-auth sessions cannot update Supabase directly due to RLS — use backend admin endpoint
        try {
          const { ok, json, error, url } = await postProfileUpdate({ profileId: userId, push_token: token });
          
          if (!ok) {
            console.error('Erreur sauvegarde token via backend:', error);
            return;
          }
          
          return;
        } catch (e) {
          console.error('Erreur sauvegarde token via backend (catch):', e);
          // Fall through to try supabase directly
        }
      }

      const { error } = await supabase
        .from('profiles')
        .update({ push_token: token })
        .eq('id', userId);

      if (error) {
        console.error('Erreur sauvegarde token:', error);
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
          // Channel may already exist, ignore
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
          
          // Afficher une alerte quand l'app est au premier plan
          Dialog.alert({
            title: notification.title || 'Notification',
            message: notification.body || '',
          });
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
          
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
