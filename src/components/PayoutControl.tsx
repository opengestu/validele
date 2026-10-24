import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, HelpCircle, ShieldCheck, Wallet } from 'lucide-react';

type Settings = { mode: 'manual' | 'automatic'; commission_pct: number | null; commission_configured: boolean; webhook_configured: boolean; updated_at: string; fallback_enabled: boolean; routing_configured: boolean; pixpay_configured: boolean; paydunya_configured: boolean };
type Dispatch = { id: string; amount: number; status: string; created_at: string; transaction_id: string | null; provider: string; collection_provider: string | null; fallback_of: string | null };
const providerName = (provider?: string | null) => ({ pixpay: 'Pixpay', paydunya: 'PayDunya' })[provider || ''] || 'À identifier';
const dispatchStatus = (status: string) => ({ PROCESSING: 'En cours', UNKNOWN: 'À vérifier', SUCCESSFUL: 'Payé', FAILED: 'Échec confirmé' })[status] || status;
const statusStyle = (status: string) => ({ PROCESSING: 'bg-blue-50 text-blue-700', UNKNOWN: 'bg-amber-50 text-amber-800', SUCCESSFUL: 'bg-emerald-50 text-emerald-700', FAILED: 'bg-red-50 text-red-700' })[status] || 'bg-slate-100 text-slate-700';

export default function PayoutControl({ getAuthHeader, searchQuery = '' }: { getAuthHeader: () => HeadersInit; searchQuery?: string }) {
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

  async function updateSettings(change: Partial<Pick<Settings, 'mode' | 'fallback_enabled'>>) {
    if (change.mode === 'automatic' && !window.confirm('Activer les payouts automatiques ? Les commandes livrées avec paiement confirmé seront traitées dès le prochain passage, y compris celles déjà en attente.')) return;
    if (change.fallback_enabled && !window.confirm('Autoriser le secours automatique ? Après un échec confirmé, une seule tentative pourra débiter le solde de l’autre prestataire. Les virements en cours ou incertains resteront bloqués.')) return;
    setSaving(true);
    try {
      const headers = new Headers(authRef.current());
      headers.set('Content-Type', 'application/json');
      const response = await fetch(apiUrl('/api/admin/payout-settings'), { method: 'PUT', credentials: 'include', headers, body: JSON.stringify(change) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Modification impossible');
      setSettings(json.settings);
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Modification impossible'); }
    finally { setSaving(false); }
  }
  async function tryFallback(attempt: Dispatch) {
    const target = attempt.provider === 'pixpay' ? 'PayDunya' : 'Pixpay';
    if (!window.confirm(`Tenter le secours via ${target} pour ${Number(attempt.amount).toLocaleString('fr-FR')} FCFA ? Ce virement utilisera le solde ${target}, après vérification de l’échec précédent.`)) return;
    setSaving(true);
    try {
      const response = await fetch(apiUrl(`/api/admin/payout-attempts/${attempt.id}/fallback`), { method: 'POST', credentials: 'include', headers: authRef.current() });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || json.message || 'Secours indisponible');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Secours indisponible'); }
    finally { setSaving(false); }
  }
  const query = searchQuery.trim().toLocaleLowerCase('fr-FR');
  const visibleAttempts = attempts.filter(attempt => !query || [attempt.id, attempt.transaction_id, providerName(attempt.provider), providerName(attempt.collection_provider), dispatchStatus(attempt.status), attempt.status, String(attempt.amount), attempt.fallback_of ? 'secours' : ''].some(value => value?.toLocaleLowerCase('fr-FR').includes(query)));
  return <Card>
    <CardHeader className="gap-3 border-b sm:flex-row sm:items-center sm:justify-between">
      <div>
        <CardTitle>Paiements des vendeurs</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">Réglages des versements et suivi des derniers envois.</p>
      </div>
      <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">Commission payout : {settings?.commission_configured ? `${settings.commission_pct} %` : 'à configurer'}</span>
    </CardHeader>
    <CardContent className="space-y-5 pt-5">
      <div className="grid gap-3 md:grid-cols-2">
        <section aria-label="Mode de paiement" className="flex flex-col gap-4 rounded-xl border p-4">
          <div className="flex items-start gap-3">
            <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
            <div>
              <p className="font-semibold" role="status">Mode {settings ? (settings.mode === 'automatic' ? 'automatique actif' : 'manuel') : 'indisponible'}</p>
              <p className="mt-1 text-sm text-muted-foreground">{settings?.mode === 'automatic' ? 'Commandes éligibles traitées chaque minute.' : 'Vous déclenchez les paiements et les lots.'}</p>
            </div>
          </div>
          <div className="mt-auto">
            {settings?.mode === 'automatic'
              ? <Button variant="outline" className="w-full sm:w-auto" disabled={saving} onClick={() => updateSettings({ mode: 'manual' })}>Passer en manuel</Button>
              : <Button className="w-full sm:w-auto" disabled={!settings || !!error || saving || !settings.commission_configured || !settings.webhook_configured || !settings.routing_configured} onClick={() => updateSettings({ mode: 'automatic' })}>Activer l’automatique</Button>}
          </div>
        </section>
        <section aria-label="Secours des paiements" className="flex flex-col gap-4 rounded-xl border p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
            <div>
              <p className="font-semibold">Secours automatique : {settings?.fallback_enabled ? 'activé' : 'désactivé'}</p>
              <p className="mt-1 text-sm text-muted-foreground">L’autre prestataire peut prendre le relais après un échec confirmé.</p>
            </div>
          </div>
          <div className="mt-auto"><Button variant="outline" className="w-full sm:w-auto" disabled={!settings || saving || !settings.routing_configured || (!settings.fallback_enabled && (!settings.paydunya_configured || !settings.pixpay_configured || !settings.webhook_configured))} onClick={() => updateSettings({ fallback_enabled: !settings?.fallback_enabled })}>{settings?.fallback_enabled ? 'Désactiver le secours' : 'Autoriser le secours'}</Button></div>
        </section>
      </div>

      {settings && <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Clés prestataires</span>
        {[['Pixpay', settings.pixpay_configured], ['PayDunya', settings.paydunya_configured]].map(([name, configured]) => <span key={String(name)} className={`rounded-full px-2.5 py-1 ${configured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{name} · {configured ? 'configurées' : 'à configurer'}</span>)}
        <span className="text-muted-foreground sm:ml-auto">Mode modifié le {new Date(settings.updated_at).toLocaleString('fr-FR')}</span>
      </div>}

      <details className="group rounded-xl border bg-slate-50/60">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <HelpCircle className="h-4 w-4 text-slate-500" aria-hidden="true" /> Comprendre le fonctionnement
          <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="grid gap-4 border-t px-4 py-4 text-sm text-muted-foreground sm:grid-cols-2">
          <div><h3 className="mb-1 font-medium text-foreground">Mode automatique</h3><p>Un passage a lieu chaque minute. Les lots manuels restent à déclencher dans Payouts. Revenir en manuel arrête les prochains envois automatiques ; les virements déjà réservés ou envoyés restent suivis.</p></div>
          <div><h3 className="mb-1 font-medium text-foreground">Prestataire et commission</h3><p>Un encaissement PayDunya est reversé via PayDunya, un encaissement Pixpay via Pixpay. Les montants sont séparés par prestataire et les lots existants conservent leur taux de commission.</p></div>
          <div><h3 className="mb-1 font-medium text-foreground">Secours contrôlé</h3><p>Une seule tentative chez l’autre prestataire est possible après un échec confirmé. Elle utilise son propre solde, sans transfert entre comptes. En mode manuel, le secours reste une action explicite.</p></div>
          <div><h3 className="mb-1 font-medium text-foreground">Virements à vérifier</h3><p>Un résultat incertain bloque toute relance. Vérifiez le virement chez le prestataire avant une autre action. Les clés configurées ne garantissent pas l’autorisation de déboursement du compte PayDunya.</p></div>
        </div>
      </details>

      {settings && !settings.routing_configured && <p role="alert" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Appliquer la migration de routage des payouts dans Supabase avant activation.</p>}
      {settings && !settings.webhook_configured && <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Le suivi sécurisé des paiements doit être configuré sur Render avant tout envoi.</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error} <button className="ml-2 underline" onClick={() => void load()}>Actualiser</button></p>}

      <section aria-label="Derniers envois">
        <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-semibold">Derniers envois</h3><span className="text-xs text-muted-foreground">{visibleAttempts.length} virement{visibleAttempts.length !== 1 ? 's' : ''}</span></div>
        {visibleAttempts.length ? <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[780px] text-left text-sm">
          <caption className="sr-only">Suivi des derniers virements aux vendeurs</caption>
          <thead className="bg-slate-50 text-xs font-medium text-slate-600"><tr>{['Date', 'Encaissement', 'Payout', 'Net envoyé', 'État', 'Transaction', 'Secours'].map(label => <th key={label} className="whitespace-nowrap px-4 py-3 font-medium">{label}</th>)}</tr></thead>
          <tbody>{visibleAttempts.map(attempt => <tr key={attempt.id} className="border-t align-top">
            <td className="whitespace-nowrap px-4 py-3"><span className="block">{new Date(attempt.created_at).toLocaleDateString('fr-FR')}</span><span className="text-xs text-muted-foreground">{new Date(attempt.created_at).toLocaleTimeString('fr-FR')}</span></td>
            <td className="px-4 py-3">{providerName(attempt.collection_provider)}</td>
            <td className="px-4 py-3">{providerName(attempt.provider)}{attempt.fallback_of && <span className="block text-xs text-muted-foreground">Secours</span>}</td>
            <td className="whitespace-nowrap px-4 py-3 font-medium">{Number(attempt.amount).toLocaleString('fr-FR')} FCFA</td>
            <td className="px-4 py-3"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle(attempt.status)}`}>{dispatchStatus(attempt.status)}</span>{attempt.status === 'UNKNOWN' && <span className="mt-1 block text-xs text-muted-foreground">Relance bloquée</span>}</td>
            <td className="px-4 py-3"><span className="block max-w-[180px] truncate font-mono text-xs" title={attempt.transaction_id || attempt.id}>{attempt.transaction_id || attempt.id}</span></td>
            <td className="px-4 py-3">{attempt.status === 'FAILED' && !attempt.fallback_of && !attempts.some(other => other.fallback_of === attempt.id) && <Button size="sm" variant="outline" disabled={saving || !settings?.routing_configured} onClick={() => tryFallback(attempt)}>Tenter le secours</Button>}</td>
          </tr>)}</tbody>
        </table></div> : <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{query ? 'Aucun virement ne correspond à votre recherche.' : 'Aucun virement pour le moment.'}</p>}
      </section>
    </CardContent>
  </Card>;
}
