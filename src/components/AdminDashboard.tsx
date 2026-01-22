import React, { useEffect, useState } from 'react';
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const oRes = await fetch(apiUrl('/api/admin/orders'));
      const tRes = await fetch(apiUrl('/api/admin/transactions'));
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur payout');
      toast({ title: 'Succès', description: json.message || 'Payout initié' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erreur', description: error.message || 'Erreur lors du payout', variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

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
