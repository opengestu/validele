import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { apiUrl, resolveAuthToken } from '@/lib/api';
import { registerWebPush, webPushConfigured, webPushSupported } from '@/lib/webPushNotifications';

export default function WebPushNotificationSetup() {
  const { user, userProfile } = useAuth();
  const profileId = userProfile?.id || user?.id;
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const activate = async () => {
    const { token } = await registerWebPush();
    const authToken = await resolveAuthToken();
    if (!authToken) throw new Error('Reconnectez-vous pour activer les notifications.');
    const response = await fetch(apiUrl('/api/me/push-token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ push_token: token }),
    });
    if (!response.ok) throw new Error('Enregistrement impossible. Veuillez réessayer.');
  };

  useEffect(() => {
    let cancelled = false;
    setEnabled(false);
    setAvailable(false);
    setError('');
    if (!profileId || !webPushConfigured) return;
    void (async () => {
      if (!await webPushSupported() || cancelled) return;
      setAvailable(Notification.permission !== 'denied');
      if (Notification.permission === 'granted') {
        try {
          await activate();
          if (!cancelled) setEnabled(true);
        } catch {
          if (!cancelled) setError('Réessayez pour activer les notifications.');
        }
      }
    })().catch(console.warn);
    return () => { cancelled = true; };
  }, [profileId]);

  if (!profileId || !available || enabled) return null;
  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-sm rounded-xl border bg-background p-4 shadow-lg">
      <p className="mb-2 text-sm">Recevoir les alertes de commande sur cet appareil</p>
      <button className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            // Ask during the click, before any asynchronous setup (required on Safari).
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') { setAvailable(false); return; }
            await activate();
            setEnabled(true);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Activation impossible.');
          } finally { setBusy(false); }
        }}>
        {busy ? 'Activation…' : 'Activer les notifications'}
      </button>
      <button className="ml-3 text-sm text-muted-foreground" onClick={() => setAvailable(false)}>Plus tard</button>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
