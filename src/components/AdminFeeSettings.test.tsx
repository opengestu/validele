import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AdminFeeSettings from './AdminFeeSettings';
afterEach(() => vi.restoreAllMocks());
it('enregistre les deux taux après confirmation', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ success: true }) } as Response);
  const onSaved = vi.fn().mockResolvedValue(undefined);
  render(<AdminFeeSettings commission={2} protection={3} editable getAuthHeader={() => ({})} onSaved={onSaved} />);
  fireEvent.click(screen.getByText('Modifier les taux'));
  fireEvent.change(screen.getByLabelText('Commission vendeur (%)'), { target: { value: '4.5' } });
  fireEvent.change(screen.getByLabelText('Frais de protection acheteur (%)'), { target: { value: '0' } });
  fireEvent.click(screen.getByText('Enregistrer'));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(JSON.parse(request.mock.calls[0][1]!.body as string)).toEqual({ commission_pct: 4.5, protection_fee_pct: 0 });
});
it('annulation de confirmation ne modifie aucun taux', () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  const request = vi.spyOn(globalThis, 'fetch');
  render(<AdminFeeSettings commission={2} protection={3} editable getAuthHeader={() => ({})} onSaved={async () => {}} />);
  fireEvent.click(screen.getByText('Modifier les taux'));
  fireEvent.click(screen.getByText('Enregistrer'));
  expect(request).not.toHaveBeenCalled();
});
