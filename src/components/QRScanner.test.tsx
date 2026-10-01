import React from 'react';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import QRScanner from './QRScanner';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'vendor-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/api', () => ({ apiUrl: (path: string) => path, resolveAuthToken: async () => 'token' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/services/notifications', () => ({ notifyBuyerDeliveryStarted: vi.fn(), notifyDeliveryCompleted: vi.fn() }));
vi.mock('html5-qrcode', () => ({ Html5Qrcode: class {
  getState() { return 1; }
  async start() {}
  async stop() {}
  clear() {}
} }));

beforeEach(() => {
  Object.assign(window.location, { pathname: '/vendor/scanner', search: '?orderId=order-1&scan=1' });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.assign(window.location, { pathname: '/', search: '' });
});

test('vendor opens the selected order directly in client scan mode', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, orders: [{
    id: 'order-1', status: 'in_delivery', delivery_person_id: 'vendor-1', order_code: 'CMD1', qr_code: 'CLIENT-SECRET',
  }] }) });
  vi.stubGlobal('fetch', fetchMock);
  render(<MemoryRouter><QRScanner /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Scannez le QR code du client pour confirmer la commande')).toBeInTheDocument());
  expect(screen.queryByText('Scanner QR Commande')).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText('Ex: CAB1234')).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith('/api/vendor/orders', expect.objectContaining({
    body: JSON.stringify({ vendor_id: 'vendor-1' }),
  }));
});

test('vendor cannot open the client scanner for another courier’s order', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, orders: [{
    id: 'order-1', status: 'in_delivery', delivery_person_id: 'courier-2',
  }] }) }));
  render(<MemoryRouter><QRScanner /></MemoryRouter>);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(screen.queryByText('Scanner QR Commande')).not.toBeInTheDocument();
  expect(screen.queryByText('Scannez le QR code du client pour confirmer la commande')).not.toBeInTheDocument();
});

test('backup code is verified by the server before receipt confirmation', async () => {
  const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url === '/api/vendor/orders' ? { success: true, orders: [{
    id: 'order-1', status: 'in_delivery', delivery_person_id: 'vendor-1', qr_code: 'CLIENT-SECRET',
  }] } : { success: true, proof: 'signed-receipt-proof' } }));
  vi.stubGlobal('fetch', fetchMock);
  render(<MemoryRouter><QRScanner /></MemoryRouter>);
  const input = await screen.findByLabelText('Scan impossible ? Code client à 4 chiffres');
  fireEvent.change(input, { target: { value: '0042' } });
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }));
  await screen.findByText('Code de secours valide pour cette commande');
  expect(fetchMock).toHaveBeenCalledWith('/api/orders/verify-receipt-code', expect.objectContaining({ body: JSON.stringify({ orderId: 'order-1', code: '0042' }) }));
  expect(fetchMock.mock.calls.some(([url]) => url === '/api/orders/mark-delivered')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer la réception du colis' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/orders/mark-delivered', expect.objectContaining({
    body: JSON.stringify({ orderId: 'order-1', deliveredBy: 'vendor-1', scannedQrCode: '', receiptProof: 'signed-receipt-proof' }),
  })));
});
