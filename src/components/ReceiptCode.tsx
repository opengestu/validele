import React, { useEffect, useState } from 'react';
import { apiUrl, resolveAuthToken } from '@/lib/api';
import { Button } from '@/components/ui/button';

export default function ReceiptCode({ qrCode, code }: { qrCode?: string; code?: string | null }) {
  const [loadedCode, setLoadedCode] = useState('');
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (code || !qrCode) return;
    let cancelled = false;
    setLoadedCode('');
    setError(false);
    void (async () => {
      try {
        const token = await resolveAuthToken();
        const response = await fetch(apiUrl('/api/orders/receipt-code'), {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ qrCode }),
        });
        const result = await response.json();
        if (!response.ok || !result.success || !/^\d{4}$/.test(result.code)) throw new Error('Unavailable');
        if (!cancelled) setLoadedCode(result.code);
      } catch { if (!cancelled) setError(true); }
    })();
    return () => { cancelled = true; };
  }, [code, qrCode, retry]);
  return (
    <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
      <p className="text-sm font-semibold">Code de secours à 4 chiffres</p>
      {(code || loadedCode) ? <p className="my-2 text-3xl font-bold tracking-[0.3em]" aria-label="Code de secours">{code || loadedCode}</p> :
        <p className="text-xs my-2">{error || !qrCode ? 'Code temporairement indisponible.' : 'Chargement du code…'}</p>}
      {error && <Button variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>Réessayer</Button>}
      <p className="text-xs text-amber-900">Vérifiez le produit avant de présenter votre QR code ou de communiquer ces 4 chiffres au vendeur ou au livreur. Ils confirment la réception du colis.</p>
    </div>
  );
}
