import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PhoneAuthForm } from './PhoneAuthForm';

describe('PhoneAuthForm dev simulator', () => {
  test('shows simulator when test number entered and simulates buyer session', async () => {
    render(
      <MemoryRouter>
        <PhoneAuthForm />
      </MemoryRouter>
    );

    const phoneInput = screen.getByPlaceholderText('7X XXX XX XX');
    fireEvent.paste(phoneInput, { clipboardData: { getData: () => '777693020' } });

    const simHeader = await screen.findByText(/Numéro de test détecté/i);
    expect(simHeader).toBeInTheDocument();

    const simClient = screen.getByText('Simuler Client');
    fireEvent.click(simClient);

    await waitFor(() => {
      const sms = localStorage.getItem('sms_auth_session');
      expect(sms).toBeTruthy();
      const parsed = JSON.parse(sms || '{}');
      expect(parsed.role).toBe('buyer');
      expect(parsed.phone.endsWith('777693020')).toBeTruthy();
    });

    await waitFor(() => expect(window.location.href).toContain('/buyer'));
  });

  test('simulator vendor sets auth_token and redirects', async () => {
    render(
      <MemoryRouter>
        <PhoneAuthForm />
      </MemoryRouter>
    );
    const phoneInput = screen.getByPlaceholderText('7X XXX XX XX');
    fireEvent.paste(phoneInput, { clipboardData: { getData: () => '777693020' } });
    const simVendor = await screen.findByText('Simuler Vendeur');
    fireEvent.click(simVendor);
    await waitFor(() => {
      const sms = JSON.parse(localStorage.getItem('sms_auth_session') || '{}');
      expect(sms.role).toBe('vendor');
      expect(localStorage.getItem('auth_token')).toBe('dev-token-vendor');
      expect(window.location.href).toContain('/vendor');
    });
  });
});