import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PhoneLoginFlow from './PhoneLoginFlow';

describe('PhoneLoginFlow simulator', () => {
  test('shows simulator panel and redirects on simulate click', async () => {
    render(
      <MemoryRouter>
        <PhoneLoginFlow />
      </MemoryRouter>
    );
    const phoneInput = screen.getByPlaceholderText('+2217xxxxxxxx');
    fireEvent.change(phoneInput, { target: { value: '777693020' } });

    const simHeader = await screen.findByText(/Numéro de test détecté/i);
    expect(simHeader).toBeInTheDocument();

    const simBuyer = screen.getByText('Simuler Client');
    fireEvent.click(simBuyer);

    await waitFor(() => {
      const sms = JSON.parse(localStorage.getItem('sms_auth_session') || '{}');
      expect(sms.role).toBe('buyer');
      expect(window.location.href).toContain('/buyer');
    });
  });
});