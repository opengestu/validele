 
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { apiUrl } from '@/lib/api';
import useNetwork from '@/hooks/useNetwork';

type Order = {
  id: string;
  order_code?: string;
  total_amount?: number;
  status?: string;
  vendor_id?: string;
  payout_status?: string | null;
  payout_requested_at?: string | null;
  payout_requested_by?: string | null;
};

type Transaction = {
  id: string;
  transaction_id?: string;
  order_id?: string;
  batch_id?: string | null;
  amount?: number;
  status?: string;
  transaction_type?: string;
  provider_transaction_id?: string | null;
  provider_response?: Record<string, unknown> | null;
  raw_response?: Record<string, unknown> | null;
  created_at?: string;
};

// Extended types used in admin dashboard
type ProfileRef = {
  id: string;
  full_name?: string;
  phone?: string;
  wallet_type?: string | null;
};

type OrderFull = Order & {
  buyer?: ProfileRef | null;
  vendor?: ProfileRef | null;
  delivery?: ProfileRef | null;
  buyer_id?: string | null;
  vendor_id?: string | null;
  delivery_person_id?: string | null;
};

type TransactionFull = Transaction & {
  order?: { id: string; order_code?: string } | null;
};

type Timer = {
  id: string;
  order?: { id: string; order_code?: string } | null;
  started_at: string;
  duration_seconds: number;
  message?: string | null;
  active?: boolean;
  started_by?: string | null;
};

// Payout batches & items (for scheduled/manual mass payouts)
type PayoutBatch = {
  id: string;
  created_by?: string | null;
  scheduled_at?: string;
  processed_at?: string | null;
  status?: 'scheduled' | 'processing' | 'completed' | 'failed' | 'cancelled';
  total_amount?: number;
  commission_pct?: number | null;
  notes?: string | null;
  created_at?: string;
};

type PayoutBatchItem = {
  id: string;
  batch_id?: string;
  order_id?: string | null;
  vendor_id?: string | null;
  vendor?: ProfileRef | null;
  amount?: number;
  commission_pct?: number | null;
  commission_amount?: number | null;
  net_amount?: number | null;
  status?: 'queued' | 'processing' | 'paid' | 'failed';
  provider_transaction_id?: string | null;
  provider_response?: Record<string, unknown> | null;
  created_at?: string;
  order?: { id: string; order_code?: string } | null;
};

const AdminDashboard: React.FC = () => {
  const { toast } = useToast();
  const { session, userProfile } = useAuth();
  const params = useParams();
  const adminId = params?.adminId;
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [timers, setTimers] = useState<Timer[]>([]);
  const [batches, setBatches] = useState<PayoutBatch[]>([]);
  const [batchItems, setBatchItems] = useState<PayoutBatchItem[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<PayoutBatch | null>(null);
  const [selectedBatchItems, setSelectedBatchItems] = useState<PayoutBatchItem[]>([]);
  const [batchDetailsOpen, setBatchDetailsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'orders'|'transactions'|'timers'|'payouts'|'payouts_history'>('orders');

  const ADMIN_ID = import.meta.env.VITE_ADMIN_USER_ID || '';
  // If we have a userProfile, ensure it matches the admin id or the adminId param.
  // If there is no userProfile (not signed-in via supabase), allow the page to attempt admin login via cookies.
  const isAdminUser = userProfile ? !!(userProfile.id === ADMIN_ID || (adminId && userProfile.id === adminId)) : true;


  useEffect(() => {
    // If the user is known and not admin, block access. If userProfile is missing, allow showing login form.
    if (userProfile && !isAdminUser) {
      setLoading(false);
      return;
    }
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile, adminId]);

  const getAuthHeader = (): HeadersInit => {
    const adminToken = localStorage.getItem('admin_token');
    if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
    if (adminToken) return { Authorization: `Bearer ${adminToken}` };
    return {};
  };

  // Helper: safely extract provider_id from a raw provider response object
  const getProviderId = (raw?: Record<string, unknown> | null): string | undefined => {
    try {
      if (!raw || typeof raw !== 'object') return undefined;

      // 1) Check nested `data.provider_id` shape
      const maybeData = (raw as { data?: unknown }).data;
      if (maybeData && typeof maybeData === 'object' && 'provider_id' in (maybeData as Record<string, unknown>)) {
        const pid = (maybeData as Record<string, unknown>)['provider_id'];
        return pid == null ? undefined : String(pid);
      }

      // 2) Direct `provider_id` on root
      if ('provider_id' in (raw as Record<string, unknown>)) {
        const pid = (raw as Record<string, unknown>)['provider_id'];
        return pid == null ? undefined : String(pid);
      }

      return undefined;
    } catch {
      return undefined;
    }
  };

  // New: admin login (email/password + optional 2FA) UI state
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminOtp, setAdminOtp] = useState('');
  const [adminProcessing, setAdminProcessing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Batch details modal state
  const [selectedVendorForInvoice, setSelectedVendorForInvoice] = useState<string | null>(null);

  // Note: PIN-based admin login has been disabled for security reasons. The legacy PIN flow is blocked server-side for admin profiles.
  // The submitPinAsAdmin function and related local PIN UI states were intentionally removed.


  const isOnline = useNetwork();

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeader();
      const oRes = await fetch(apiUrl('/api/admin/orders'), { headers, credentials: 'include' });
      if (oRes.status === 401) {
        setShowAdminLogin(true);
        setLoading(false);
        return;
      }
      const tRes = await fetch(apiUrl('/api/admin/transactions'), { headers, credentials: 'include' });
      if (tRes.status === 401) {
        setShowAdminLogin(true);
        setLoading(false);
        return;
      }

      const timRes = await fetch(apiUrl('/api/admin/timers'), { headers, credentials: 'include' });
      const batchesRes = await fetch(apiUrl('/api/admin/payout-batches'), { headers, credentials: 'include' });

      const oJson = await oRes.json();
      const tJson = await tRes.json();
      const timJson = await timRes.json();
      const batchesJson = await batchesRes.json();

      if (oRes.ok) {
        setOrders(oJson.orders || []);
        try { localStorage.setItem('admin_orders', JSON.stringify(oJson.orders || [])); } catch(e) { /* ignore cache errors */ }
      }
      if (tRes.ok) {
        setTransactions(tJson.transactions || []);
        try { localStorage.setItem('admin_transactions', JSON.stringify(tJson.transactions || [])); } catch(e) { /* ignore cache errors */ }
      }
      if (timRes.ok) {
        setTimers(timJson.timers || []);
        try { localStorage.setItem('admin_timers', JSON.stringify(timJson.timers || [])); } catch(e) { /* ignore cache errors */ }
      }

      if (batchesRes.ok) {
        setBatches(batchesJson.batches || []);
        setBatchItems(batchesJson.items || []);
      }
    } catch (error) {
      // Try to load cached admin data when offline
      try {
        const cachedOrders = localStorage.getItem('admin_orders');
        const cachedTrans = localStorage.getItem('admin_transactions');
        const cachedTimers = localStorage.getItem('admin_timers');
        let used = false;
        if (cachedOrders) { setOrders(JSON.parse(cachedOrders)); used = true; }
        if (cachedTrans) { setTransactions(JSON.parse(cachedTrans)); used = true; }
        if (cachedTimers) { setTimers(JSON.parse(cachedTimers)); used = true; }
        if (used) {
          toast({ title: 'Hors-ligne', description: 'Affichage des données admin en cache' });
          return;
        }
      } catch (e) {
        // ignore
      }

      toast({ title: 'Erreur', description: 'Impossible de charger les données admin', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const startTimer = async (orderId: string, durationSeconds: number, message?: string) => {
    try {
      const res = await fetch(apiUrl('/api/admin/start-timer'), {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ orderId, durationSeconds, message })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Erreur démarrage timer');
      toast({ title: 'Succès', description: 'Timer démarré' });
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err || 'Erreur démarrage timer');
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    }
  };

  const cancelTimer = async (timerId: string) => {
    try {
      const res = await fetch(apiUrl('/api/admin/cancel-timer'), {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ timerId })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Erreur annulation');
      toast({ title: 'Succès', description: 'Timer annulé' });
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err || 'Erreur annulation');
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    }
  };

  const notifyUser = async (userId: string | undefined, title: string, body: string) => {
    if (!userId) return toast({ title: 'Erreur', description: 'Utilisateur introuvable', variant: 'destructive' });
    try {
      const res = await fetch(apiUrl('/api/admin/notify'), {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ userId, title, body })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Erreur notify');
      toast({ title: 'Succès', description: 'Notification envoyée' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err || 'Erreur notify');
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    }
  };

  const handlePayout = async (orderId: string) => {
    setProcessing(true);
    try {
      // 1) verify eligibility (server-side authoritative check)
      const verifyRes = await fetch(apiUrl('/api/admin/verify-and-payout'), {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, body: JSON.stringify({ orderId, execute: false })
      });
      const verifyJson = await verifyRes.json();

      if (!verifyRes.ok) throw new Error(verifyJson.error || 'Erreur vérification');

      const report = verifyJson.report;
      if (!report || !report.eligible) {
        const reasons = (report && report.reasons && report.reasons.length) ? report.reasons.join(', ') : 'Non éligible selon règles internes';
        toast({ title: 'Non éligible', description: `Payout bloqué: ${reasons}`, variant: 'destructive' });
        return;
      }

      // 2) confirm with admin
      if (!confirm('Confirmer le paiement au vendeur pour cette commande ?')) return;

      // 3) execute payout
      const execRes = await fetch(apiUrl('/api/admin/verify-and-payout'), {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, body: JSON.stringify({ orderId, execute: true })
      });
      const execJson = await execRes.json();
      if (!execRes.ok) throw new Error(execJson.error || 'Erreur exécution payout');

      toast({ title: 'Succès', description: 'Payout initié (processing).' });
      fetchData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error || 'Erreur lors du payout');
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  if (!isAdminUser) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <h1 className="text-xl font-bold mb-2">Accès restreint</h1>
        <p className="text-gray-600">Cette page est réservée à l'administrateur.</p>
      </div>
    );
  }

  if (showAdminLogin) {
    return (
      <div className="max-w-md mx-auto py-12 text-center">
        <h1 className="text-xl font-bold mb-4">Authentification administrateur requise</h1>
        <p className="text-gray-600 mb-4">Connectez-vous avec votre compte administrateur</p>

        <div>
          <input
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            placeholder="Email"
            className="mb-3 px-3 py-2 border rounded w-full"
            autoComplete="username"
          />
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="Mot de passe"
            className="mb-3 px-3 py-2 border rounded w-full"
            autoComplete="current-password"
          />
          <input
            type="text"
            value={adminOtp}
            onChange={(e) => setAdminOtp(e.target.value)}
            placeholder="Code 2FA (optionnel)"
            className="mb-3 px-3 py-2 border rounded w-full"
          />
          {authError && <div className="text-sm text-red-600 mb-3">{authError}</div>}
          <div className="flex gap-2 justify-center">
            <Button disabled={adminProcessing} onClick={async () => {
              setAdminProcessing(true);
              setAuthError(null);
              try {
                const res = await fetch(apiUrl('/api/admin/login'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ email: adminEmail, password: adminPassword, otp: adminOtp || undefined })
                });
                const json = await res.json();
                if (!res.ok) {
                  const msg = json?.error || json?.message || 'Identifiants invalides';
                  setAuthError(msg);
                  toast({ title: 'Erreur', description: msg, variant: 'destructive' });
                  return;
                }
                // Prefer httpOnly cookie set by server; remove legacy admin_token
                try { localStorage.removeItem('admin_token'); } catch(e) { /* ignore */ }
                setShowAdminLogin(false);
                setAdminEmail(''); setAdminPassword(''); setAdminOtp('');
                setAuthError(null);
                toast({ title: 'Authentifié', description: "Vous êtes connecté en tant qu'admin" });
                fetchData();
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err || 'Erreur connexion');
                setAuthError(message);
                toast({ title: 'Erreur', description: message, variant: 'destructive' });
              } finally {
                setAdminProcessing(false);
              }
            }}>Se connecter</Button>

            <Button variant="secondary" disabled title="Le login par PIN est désactivé pour les administrateurs">PIN désactivé</Button>
          </div>
        </div>

      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-6">
      <h1 className="text-2xl font-bold mb-4">Dashboard Admin</h1>
      {!isOnline && (
        <div className="max-w-6xl mx-auto mb-4">
          <div className="bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 px-4 py-2 rounded">⚠️ Hors-ligne — affichage des données en cache</div>
        </div>
      )}

      <div>
        <div className="flex gap-4 mb-4">
          <button className={`px-3 py-2 rounded ${activeTab === 'orders' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`} onClick={() => setActiveTab('orders')}>Commandes</button>
          <button className={`px-3 py-2 rounded ${activeTab === 'transactions' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`} onClick={() => setActiveTab('transactions')}>Transactions</button>
          <button className={`px-3 py-2 rounded ${activeTab === 'timers' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`} onClick={() => setActiveTab('timers')}>Timers</button>
          <button className={`px-3 py-2 rounded ${activeTab === 'payouts' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`} onClick={() => setActiveTab('payouts')}>Payouts</button>
          <button className={`px-3 py-2 rounded ${activeTab === 'payouts_history' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`} onClick={() => setActiveTab('payouts_history')}>Historique</button>
        </div>

        {activeTab === 'orders' && (
          <Card>
            <CardHeader>
              <CardTitle>Commandes</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Acheteur</TableHead>
                    <TableHead>Vendeur</TableHead>
                    <TableHead>Livraison</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Payout</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders
                    .filter(o => String(o.status).toLowerCase() === 'delivered')
                    .map((o: OrderFull) => (
                      <TableRow key={o.id}>
                        <TableCell>{o.id}</TableCell>
                        <TableCell>{o.order_code}</TableCell>
                        <TableCell>{o.buyer?.full_name || '-'}</TableCell>
                        <TableCell>{o.vendor?.full_name || '-'}</TableCell>
                        <TableCell>{o.delivery?.full_name || '-'}</TableCell>
                        <TableCell>{o.total_amount?.toLocaleString()} FCFA</TableCell>
                        <TableCell>{o.status}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-sm ${o.payout_status === 'paid' ? 'bg-green-100 text-green-800' : o.payout_status === 'processing' ? 'bg-yellow-100 text-yellow-800' : 'bg-slate-100 text-slate-700'}`}>
                            {o.payout_status || '-'}
                          </span>
                          {o.payout_requested_at ? ` — ${new Date(o.payout_requested_at).toLocaleString()}` : ''}
                        </TableCell>
                        <TableCell className="flex gap-2">
                          <Button size="sm" onClick={() => handlePayout(o.id)} disabled={!(o.status === 'delivered' && (o.payout_status === 'requested' || o.payout_status === 'scheduled')) || processing}>Payer</Button>
                          <Button size="sm" variant="secondary" onClick={() => {
                            const minutes = Number(prompt('Durée du compte à rebours (minutes)?', '10'));
                            if (!minutes || minutes <= 0) return; startTimer(o.id, minutes * 60, `Admin started ${minutes}m countdown`);
                          }}>Start Timer</Button>
                          <Button size="sm" variant="ghost" onClick={() => notifyUser(o.buyer?.id, 'Message admin', 'Message')}>Notifier</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {activeTab === 'transactions' && (
          <Card>
            <CardHeader>
              <CardTitle>Transactions (payouts)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Order / Batch</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Provider Tx</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t: TransactionFull) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.transaction_id || t.id}</TableCell>
                      <TableCell>{t.order?.order_code || t.order_id || (t.batch_id ? `batch:${t.batch_id}` : '-')}</TableCell>
                      <TableCell>{t.amount?.toLocaleString()} FCFA</TableCell>
                      <TableCell>{t.transaction_type}</TableCell>
                      <TableCell>{t.provider_transaction_id || getProviderId(t.raw_response) || '-'}</TableCell>
                      <TableCell>{t.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {activeTab === 'timers' && (
          <Card>
            <CardHeader>
              <CardTitle>Timers administrateur</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Remaining</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timers.map((t: Timer) => {
                    const end = new Date(t.started_at).getTime() + (t.duration_seconds * 1000);
                    const now = Date.now();
                    const remaining = Math.max(0, Math.floor((end - now) / 1000));
                    return (
                      <TableRow key={t.id}>
                        <TableCell>{t.id}</TableCell>
                        <TableCell>{t.order?.order_code || '-'}</TableCell>
                        <TableCell>{new Date(t.started_at).toLocaleString()}</TableCell>
                        <TableCell>{Math.floor(remaining / 60)}m {remaining % 60}s</TableCell>
                        <TableCell>{t.message || '-'}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="destructive" onClick={() => cancelTimer(t.id)}>Annuler</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {activeTab === 'payouts' && (
          <Card>
            <CardHeader>
              <CardTitle>Payout Batches</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div />
                <div className="flex gap-2">
                  <Button onClick={async () => {
                    setProcessing(true);
                    try {
                      const pctRaw = prompt('Pourcentage de commission à appliquer sur ce batch (ex: 2 pour 2%) ?', '0');
                      if (pctRaw === null) { setProcessing(false); return; }
                      const pct = Number(pctRaw);
                      if (isNaN(pct) || pct < 0) throw new Error('Commission invalide');

                      const res = await fetch(apiUrl('/api/admin/payout-batches/create'), { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, body: JSON.stringify({ commission_pct: pct }) });
                      const json = await res.json();
                      if (!res.ok) throw new Error(json?.error || 'Erreur création batch');
                      toast({ title: 'Succès', description: `Batch créé (commission ${pct}%)` });
                      fetchData();
                    } catch (err: unknown) {
                      const message = err instanceof Error ? err.message : String(err || 'Erreur');
                      toast({ title: 'Erreur', description: message, variant: 'destructive' });
                    } finally { setProcessing(false); }
                  }}>Créer Batch</Button>
                  <Button variant="secondary" onClick={async () => { setProcessing(true); try { const res = await fetch(apiUrl('/api/admin/payout-batches/process-scheduled'), { method: 'POST', headers: { ...getAuthHeader() } }); const json = await res.json(); if (!res.ok) throw new Error(json?.error || 'Erreur'); toast({ title: 'Succès', description: `Processed ${json.processed || 0} batches` }); fetchData(); } catch(err: unknown) { toast({ title: 'Erreur', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); } finally { setProcessing(false); } }}>Exécuter programmés</Button>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.filter(b => !['completed','failed','cancelled'].includes(b.status || '')).map(b => (
                    <TableRow key={b.id}>
                      <TableCell>{b.id}</TableCell>
                      <TableCell>{b.scheduled_at ? new Date(b.scheduled_at).toLocaleString() : '-'}</TableCell>
                      <TableCell>{b.status}</TableCell>
                      <TableCell>
                        {(b.total_amount||0).toLocaleString()} FCFA
                        {b.commission_pct ? ` — commission ${b.commission_pct}%` : ''}
                      </TableCell>
                      <TableCell className="flex gap-2">
                        <Button size="sm" onClick={async () => { setProcessing(true); try { const res = await fetch(apiUrl(`/api/admin/payout-batches/${b.id}/details`), { headers: { ...getAuthHeader() } }); const json = await res.json(); if (!res.ok) throw new Error(json?.error || 'Erreur'); setSelectedBatch(json.batch); setSelectedBatchItems(json.items||[]); setBatchDetailsOpen(true); } catch(err: unknown) { toast({ title: 'Erreur', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); } finally { setProcessing(false); } }}>Details</Button>
                        <Button size="sm" onClick={async () => { setProcessing(true); try { const res = await fetch(apiUrl(`/api/admin/payout-batches/${b.id}/process`), { method: 'POST', headers: { ...getAuthHeader() } }); const json = await res.json(); if (!res.ok) throw new Error(json?.error || 'Erreur'); toast({ title: 'Succès', description: 'Batch processed' }); fetchData(); } catch(err: unknown) { toast({ title: 'Erreur', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); } finally { setProcessing(false); } }}>Process</Button>
                        <Button size="sm" variant="destructive" onClick={async () => { setProcessing(true); try { const res = await fetch(apiUrl(`/api/admin/payout-batches/${b.id}/cancel`), { method: 'POST', headers: { ...getAuthHeader() } }); const json = await res.json(); if (!res.ok) throw new Error(json?.error || 'Erreur'); toast({ title: 'Succès', description: 'Batch cancelled' }); fetchData(); } catch(err: unknown) { toast({ title: 'Erreur', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); } finally { setProcessing(false); } }}>Cancel</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {activeTab === 'payouts_history' && (
          <Card>
            <CardHeader>
              <CardTitle>Historique Payouts</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-3">Liste des batches complétés / annulés (historique)</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.filter(b => ['completed','failed','cancelled'].includes(b.status || '')).map(b => (
                    <TableRow key={b.id}>
                      <TableCell>{b.id}</TableCell>
                      <TableCell>{b.scheduled_at ? new Date(b.scheduled_at).toLocaleString() : '-'}</TableCell>
                      <TableCell>{b.status}</TableCell>
                      <TableCell>{(b.total_amount||0).toLocaleString()} FCFA</TableCell>
                      <TableCell className="flex gap-2">
                        <Button size="sm" onClick={async () => { setProcessing(true); try { const res = await fetch(apiUrl(`/api/admin/payout-batches/${b.id}/details`), { headers: { ...getAuthHeader() } }); const json = await res.json(); if (!res.ok) throw new Error(json?.error || 'Erreur'); setSelectedBatch(json.batch); setSelectedBatchItems(json.items||[]); setBatchDetailsOpen(true); } catch(err: unknown) { toast({ title: 'Erreur', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); } finally { setProcessing(false); } }}>Details</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    {batchDetailsOpen && <BatchDetailsModal batch={selectedBatch} items={selectedBatchItems} onClose={() => setBatchDetailsOpen(false)} onOpenInvoice={(vendorId) => window.open(apiUrl(`/api/admin/payout-batches/${selectedBatch?.id}/invoice?vendorId=${encodeURIComponent(vendorId)}`), '_blank')} />}
    </div>
  );
};

// Batch details modal
{ /* Render a printable details modal when open */ }
function BatchDetailsModal({ batch, items, onClose, onOpenInvoice }:{ batch: PayoutBatch | null; items: PayoutBatchItem[]; onClose: () => void; onOpenInvoice: (vendorId: string) => void }){
  if (!batch) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-6">
      <div className="bg-white rounded-xl shadow-lg max-w-4xl w-full overflow-auto" style={{ maxHeight: '80vh' }}>
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Détails Batch {batch.id}</h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>Fermer</Button>
          </div>
        </div>
        <div className="p-4">
          <p><strong>Scheduled:</strong> {batch.scheduled_at ? new Date(batch.scheduled_at).toLocaleString() : '-'}</p>
          <p><strong>Status:</strong> {batch.status}</p>
          <p><strong>Commission:</strong> {batch.commission_pct || 0}%</p>

          <div className="mt-4">
            <h4 className="font-semibold mb-2">Items</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Vendeur</TableHead>
                  <TableHead>Brut</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(it => (
                  <TableRow key={it.id}>
                    <TableCell>{it.order?.order_code || it.order_id}</TableCell>
                    <TableCell>{it.vendor?.full_name || it.vendor_id}</TableCell>
                    <TableCell>{(it.amount||0).toLocaleString()} FCFA</TableCell>
                    <TableCell>{(it.commission_amount||0).toLocaleString()} FCFA</TableCell>
                    <TableCell>{(it.net_amount||0).toLocaleString()} FCFA</TableCell>
                    <TableCell>{it.status}</TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => onOpenInvoice(it.vendor_id || '')}>Invoice</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main export
export default AdminDashboard;
