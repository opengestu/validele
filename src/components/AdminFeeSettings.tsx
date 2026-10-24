import { useState } from 'react';
import { apiUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';

export default function AdminFeeSettings({ commission, protection, editable, getAuthHeader, onSaved }: {
  commission: number | null; protection: number; editable: boolean;
  getAuthHeader: () => HeadersInit; onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [vendorRate, setVendorRate] = useState('');
  const [buyerRate, setBuyerRate] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  async function save() {
    const vendor = Number(vendorRate), buyer = Number(buyerRate);
    if (!vendorRate.trim() || !buyerRate.trim() || !Number.isFinite(vendor) || !Number.isFinite(buyer) || vendor < 0 || vendor >= 100 || buyer < 0 || buyer > 100) {
      setMessage('Commission : de 0 à moins de 100 %. Protection : de 0 à 100 %.'); return;
    }
    if (!window.confirm(`Enregistrer la commission vendeur à ${vendor} % et les frais de protection à ${buyer} % ? Ces taux s’appliquent aux nouveaux lots et aux nouvelles commandes.`)) return;
    setSaving(true); setMessage('');
    try {
      const headers = new Headers(getAuthHeader()); headers.set('Content-Type', 'application/json');
      const response = await fetch(apiUrl('/api/admin/payout-settings'), { method: 'PUT', credentials: 'include', headers, body: JSON.stringify({ commission_pct: vendor, protection_fee_pct: buyer }) });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || 'Enregistrement impossible');
      setEditing(false); setMessage('Taux enregistrés.'); await onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Enregistrement impossible'); }
    finally { setSaving(false); }
  }
  return <section aria-label="Commission et frais de protection" className="rounded-xl border p-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold">Commission et frais de protection</h3><p className="text-sm text-muted-foreground">Commission vendeur : {commission ?? 'à configurer'} % · Protection acheteur : {protection} %</p></div>
      {!editing && <Button variant="outline" disabled={!editable} onClick={() => { setVendorRate(commission == null ? '' : String(commission)); setBuyerRate(String(protection)); setEditing(true); setMessage(''); }}>Modifier les taux</Button>}
    </div>
    {editing && <form onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Commission vendeur (%)<input type="number" min="0" max="99.9999" step="any" required disabled={saving} value={vendorRate} onChange={event => setVendorRate(event.target.value)} className="mt-1 block w-full rounded border px-3 py-2" /></label>
        <label className="text-sm">Frais de protection acheteur (%)<input type="number" min="0" max="100" step="any" required disabled={saving} value={buyerRate} onChange={event => setBuyerRate(event.target.value)} className="mt-1 block w-full rounded border px-3 py-2" /></label>
      </div>
      <div className="flex gap-2"><Button disabled={saving} type="submit">{saving ? 'Enregistrement…' : 'Enregistrer'}</Button><Button variant="outline" type="button" disabled={saving} onClick={() => setEditing(false)}>Annuler</Button></div>
    </form>}
    <p className="text-xs text-muted-foreground">Les taux enregistrés ici ont priorité sur Render. Les commandes existantes et les lots déjà calculés conservent leurs montants.</p>
    {!editable && <p className="text-sm text-amber-800">Appliquer la migration des frais administrables pour modifier ces taux.</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
