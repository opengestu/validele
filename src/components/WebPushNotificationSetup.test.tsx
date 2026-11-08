import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebPushNotificationSetup from './WebPushNotificationSetup';

const mocks = vi.hoisted(() => ({
  supported: vi.fn(), register: vi.fn(), request: vi.fn(), fetch: vi.fn(),
  auth: { user: { id: 'buyer' }, userProfile: { id: 'buyer' } },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/api', () => ({ apiUrl: (url: string) => url, resolveAuthToken: async () => 'session-token' }));
vi.mock('@/lib/webPushNotifications', () => ({ webPushConfigured: true, webPushSupported: mocks.supported, registerWebPush: mocks.register }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.supported.mockResolvedValue(true);
  mocks.register.mockResolvedValue({ token: 'browser-fcm-token' });
  mocks.request.mockResolvedValue('granted');
  mocks.fetch.mockResolvedValue({ ok: true });
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: mocks.request });
  vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('browser notification activation', () => {
  it('requests permission only on click and saves the token with authentication', async () => {
    render(<WebPushNotificationSetup />);
    const button = await screen.findByText('Activer les notifications');
    expect(mocks.request).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    expect(mocks.fetch).toHaveBeenCalledWith('/api/me/push-token', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer session-token' }),
      body: JSON.stringify({ push_token: 'browser-fcm-token' }),
    }));
    await waitFor(() => expect(screen.queryByText('Activer les notifications')).toBeNull());
  });
  it('does not register after permission refusal', async () => {
    mocks.request.mockResolvedValue('denied');
    render(<WebPushNotificationSetup />);
    fireEvent.click(await screen.findByText('Activer les notifications'));
    await waitFor(() => expect(screen.queryByText('Activer les notifications')).toBeNull());
    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('keeps retry available when saving fails', async () => {
    mocks.fetch.mockResolvedValue({ ok: false });
    render(<WebPushNotificationSetup />);
    fireEvent.click(await screen.findByText('Activer les notifications'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enregistrement impossible');
    expect(screen.getByText('Activer les notifications')).not.toBeDisabled();
  });
  it('refreshes registration without asking again when permission is already granted', async () => {
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: mocks.request });
    render(<WebPushNotificationSetup />);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
