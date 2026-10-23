import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Settings = { mode: 'manual' | 'automatic'; commission_pct: number | null; commission_configured: boolean; webhook_configured: boolean; updated_at: string };
type Dispatch = { id: string; amount: number; status: string; created_at: string; transaction_id: string | null };

export default function PayoutControl({ getAuthHeader }: { getAuthHeader: () => HeadersInit }) {
  const authRef = useRef(getAuthHeader);
  authRef.current = getAuthHeader;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [attempts, setAttempts] = useState<Dispatch[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/api/admin/payout-settings'), { headers: authRef.current(), credentials: 'include' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Configuration indisponible');
      setSettings(json.settings);
      setError('');
      const attemptsResponse = await fetch(apiUrl('/api/admin/payout-attempts'), { headers: authRef.current(), credentials: 'include' });
      if (!attemptsResponse.ok) throw new Error('Suivi des virements indisponible');
      setAttempts((await attemptsResponse.json()).attempts || []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Configuration indisponible'); }
  }, []);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 15000); return () => clearInterval(timer); }, [load]);

  async function changeMode(mode: Settings['mode']) {
    if (mode === 'automatic' && !window.confirm('Activer les payouts automatiques ? Les commandes livrées avec paiement confirmé seront traitées dès le prochain passage, y compris celles déjà en attente.')) return;
    setSaving(true);
    try {
      const headers = new Headers(authRef.current());
      headers.set('Content-Type', 'application/json');
      const response = await fetch(apiUrl('/api/admin/payout-settings'), { method: 'PUT', credentials: 'include', headers, body: JSON.stringify({ mode }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Modification impossible');
      setSettings(json.settings);
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Modification impossible'); }
    finally { setSaving(false); }
  }
  return <Card className="mb-4">
    <CardHeader><CardTitle>Paiement des vendeurs</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold" role="status">Mode {settings ? (settings.mode === 'automatic' ? 'automatique actif' : 'manuel') : 'indisponible'}</p>
          <p className="text-sm text-muted-foreground">Commission payout : {settings?.commission_configured ? `${settings.commission_pct} %` : 'à configurer sur Render'}. Les lots existants conservent leur taux.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={settings?.mode === 'manual' ? 'default' : 'outline'} disabled={!settings || saving || settings.mode === 'manual'} onClick={() => changeMode('manual')}>Passer en manuel</Button>
          <Button variant={settings?.mode === 'automatic' ? 'default' : 'outline'} disabled={!settings || !!error || saving || settings.mode === 'automatic' || !settings.commission_configured || !settings.webhook_configured} onClick={() => changeMode('automatic')}>Activer l’automatique</Button>
        </div>
      </div>
      <p className="text-sm">En automatique, un passage a lieu chaque minute et regroupe les nouvelles commandes éligibles par vendeur. Les lots manuels restent à déclencher dans Payouts. Le passage en manuel arrête les prochains envois automatiques ; les virements déjà réservés ou envoyés restent suivis.</p>
      {settings && <p className="text-xs text-muted-foreground">Dernier changement de mode : {new Date(settings.updated_at).toLocaleString('fr-FR')}</p>}
      {settings && !settings.webhook_configured && <p className="text-sm text-amber-800">Le suivi sécurisé des paiements doit être configuré sur Render avant tout envoi.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error} <button className="underline" onClick={() => void load()}>Actualiser</button></p>}
      {attempts.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left font-medium">Derniers envois</caption><thead><tr><th>Date</th><th>Net envoyé</th><th>État</th><th>Transaction</th></tr></thead><tbody>{attempts.map(attempt => <tr key={attempt.id} className="border-t"><td className="py-2">{new Date(attempt.created_at).toLocaleString('fr-FR')}</td><td>{Number(attempt.amount).toLocaleString('fr-FR')} FCFA</td><td>{({ PROCESSING: 'En cours', UNKNOWN: 'À vérifier chez Pixpay — relance bloquée', SUCCESSFUL: 'Payé', FAILED: 'Échec confirmé' })[attempt.status] || attempt.status}</td><td className="font-mono text-xs">{attempt.transaction_id || attempt.id}</td></tr>)}</tbody></table></div>}
    </CardContent>
  </Card>;
}
