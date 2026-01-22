/* eslint-disable @typescript-eslint/no-require-imports */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { apiUrl } from '@/lib/api';

type Order = {
  id: string;
  order_code?: string;
  total_amount?: number;
  status?: string;
  vendor_id?: string;
};

type Transaction = {
  id: string;
  transaction_id?: string;
  order_id?: string;
  amount?: number;
  status?: string;
  transaction_type?: string;
  created_at?: string;
};

const AdminDashboard: React.FC = () => {
  const { toast } = useToast();
  const { session, userProfile } = useAuth();
  const params = useParams();
  const adminId = params?.adminId;
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const ADMIN_ID = import.meta.env.VITE_ADMIN_USER_ID || '';
  // Allow access if the logged-in user matches either the VITE admin id or the adminId param in the URL
  const isAdminUser = !!(userProfile && (userProfile.id === ADMIN_ID || (adminId && userProfile.id === adminId)));


  useEffect(() => {
    if (!isAdminUser) {
      setLoading(false);
      return;
    }
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminUser]);

  const getAuthHeader = () => ({
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeader();
      const oRes = await fetch(apiUrl('/api/admin/orders'), { headers });
      const tRes = await fetch(apiUrl('/api/admin/transactions'), { headers });
      const oJson = await oRes.json();
      const tJson = await tRes.json();
      if (oRes.ok) setOrders(oJson.orders || []);
      if (tRes.ok) setTransactions(tJson.transactions || []);
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de charger les données admin', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handlePayout = async (orderId: string) => {
    if (!confirm('Confirmer le paiement au vendeur pour cette commande ?')) return;
    setProcessing(true);
    try {
      const res = await fetch(apiUrl('/api/admin/payout-order'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ orderId })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur payout');
      toast({ title: 'Succès', description: json.message || 'Payout initié' });
      fetchData();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      toast({ title: 'Erreur', description: error.message || 'Erreur lors du payout', variant: 'destructive' });
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

  return (
    <div className="max-w-6xl mx-auto py-6">
      <h1 className="text-2xl font-bold mb-4">Dashboard Admin</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  <TableHead>Montant</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map(o => (
                  <TableRow key={o.id}>
                    <TableCell>{o.id}</TableCell>
                    <TableCell>{o.order_code}</TableCell>
                    <TableCell>{o.total_amount?.toLocaleString()} FCFA</TableCell>
                    <TableCell>{o.status}</TableCell>
                    <TableCell>
                      <Button disabled={processing} onClick={() => handlePayout(o.id)}>Payer vendeur</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transactions (payouts)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map(t => (
                  <TableRow key={t.id}>
                    <TableCell>{t.transaction_id || t.id}</TableCell>
                    <TableCell>{t.order_id}</TableCell>
                    <TableCell>{t.amount?.toLocaleString()} FCFA</TableCell>
                    <TableCell>{t.transaction_type}</TableCell>
                    <TableCell>{t.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
