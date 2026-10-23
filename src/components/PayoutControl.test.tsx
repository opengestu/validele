import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PayoutControl from './PayoutControl';

vi.mock('@/lib/api', () => ({ apiUrl: (path: string) => path }));
const auth = () => ({ Authorization: 'Bearer test' });
const settings = { mode: 'manual', commission_pct: 2, commission_configured: true, webhook_configured: true, updated_at: '2026-10-23T00:00:00Z' };
afterEach(() => vi.restoreAllMocks());
function mockApi(config = settings) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input).endsWith('payout-attempts')) return new Response(JSON.stringify({ attempts: [{ id: 'attempt', amount: 9800, status: 'UNKNOWN', transaction_id: null, created_at: '2026-10-23T00:00:00Z' }] }));
    return new Response(JSON.stringify({ settings: init?.method === 'PUT' ? { ...config, mode: JSON.parse(String(init.body)).mode } : config }));
  });
}
describe('contrôle payouts', () => {
  it('affiche le mode, le taux et les envois incertains', async () => {
    mockApi(); render(<PayoutControl getAuthHeader={auth} />);
    expect(await screen.findByText('Mode manuel')).toBeInTheDocument();
    expect(screen.getByText(/Commission payout : 2 %/)).toBeInTheDocument();
    expect(await screen.findByText(/À vérifier chez Pixpay/)).toBeInTheDocument();
  });
  it('activation explicite puis arrêt manuel', async () => {
    const fetchMock = mockApi(); vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PayoutControl getAuthHeader={auth} />);
    const activate = await screen.findByRole('button', { name: 'Activer l’automatique' });
    await waitFor(() => expect(activate).toBeEnabled()); fireEvent.click(activate);
    expect(await screen.findByText('Mode automatique actif')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Passer en manuel' }));
    expect(await screen.findByText('Mode manuel')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([,init]) => init?.method === 'PUT')).toHaveLength(2);
  });
  it('sans configuration ne permet pas activation', async () => {
    mockApi({ ...settings, webhook_configured: false }); render(<PayoutControl getAuthHeader={auth} />);
    expect(await screen.findByRole('button', { name: 'Activer l’automatique' })).toBeDisabled();
  });
  it('erreur serveur visible sans afficher une activation réussie', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Migration requise' }), { status: 503 }));
    render(<PayoutControl getAuthHeader={auth} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Migration requise');
    expect(screen.getByRole('button', { name: 'Activer l’automatique' })).toBeDisabled();
  });
});
