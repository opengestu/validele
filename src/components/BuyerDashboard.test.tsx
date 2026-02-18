import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import BuyerDashboard from './BuyerDashboard';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, signOut: vi.fn(), userProfile: { full_name: 'Dev Buyer', phone: '+221777693020' }, loading: false })
}));

describe('BuyerDashboard - dev product search', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('returns demo product when searching PD-DEV-1 with dev sms session', async () => {
    localStorage.setItem('sms_auth_session', JSON.stringify({ profileId: 'dev-buyer-777693020', role: 'buyer', phone: '+221777693020' }));

    render(
      <MemoryRouter initialEntries={["/buyer"]}>
        <TooltipProvider>
          <BuyerDashboard />
        </TooltipProvider>
      </MemoryRouter>
    );

    const input = await screen.findByPlaceholderText('Code produit...');
    fireEvent.change(input, { target: { value: 'PD-DEV-1' } });
    fireEvent.submit(input.closest('form')!);

    const productName = await screen.findByText('Produit démo — Maïs');
    expect(productName).toBeInTheDocument();
    expect(screen.getByText(/1200/)).toBeInTheDocument();
  });

  test('finds vendor-added dev product stored in localStorage', async () => {
    // seed a vendor-added dev product in localStorage
    const devProduct = {
      id: 'dev-prod-x',
      vendor_id: 'dev-vendor-777693020',
      name: 'Produit Test Local',
      description: 'Ajouté en local pour test',
      price: 2500,
      code: 'PD-LOCAL-1',
      is_available: true,
      stock_quantity: 5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    localStorage.setItem('dev_products', JSON.stringify([devProduct]));
    localStorage.setItem('sms_auth_session', JSON.stringify({ profileId: 'dev-buyer-777693020', role: 'buyer', phone: '+221777693020' }));

    render(
      <MemoryRouter initialEntries={["/buyer"]}>
        <TooltipProvider>
          <BuyerDashboard />
        </TooltipProvider>
      </MemoryRouter>
    );

    const input = await screen.findByPlaceholderText('Code produit...');
    fireEvent.change(input, { target: { value: 'PD-LOCAL-1' } });
    fireEvent.submit(input.closest('form')!);

    const productName = await screen.findByText('Produit Test Local');
    expect(productName).toBeInTheDocument();
    expect(screen.getByText(/2500/)).toBeInTheDocument();
  });

  test('dev buyer sees fake order after fictive payment (test shortcut)', async () => {
    // arrange: dev buyer session
    localStorage.setItem('sms_auth_session', JSON.stringify({ profileId: 'dev-buyer-777693020', role: 'buyer', phone: '+221777693020' }));

    render(
      <MemoryRouter initialEntries={["/buyer"]}>
        <TooltipProvider>
          <BuyerDashboard />
        </TooltipProvider>
      </MemoryRouter>
    );

    // act: search the demo product (PD-DEV-1) and open modal
    const input = await screen.findByPlaceholderText('Code produit...');
    fireEvent.change(input, { target: { value: 'PD-DEV-1' } });
    fireEvent.submit(input.closest('form')!);

    // wait for modal with demo product
    expect(await screen.findByText('Produit démo — Maïs')).toBeInTheDocument();

    // click the payment button (this should use the fake/test path)
    const payBtn = screen.getByRole('button', { name: /Payer avec Wave/i });
    fireEvent.click(payBtn);

    // assert: cached_buyer_orders and dev_order_<id> were written and contain the demo product
    await waitFor(() => {
      const cachedRaw = localStorage.getItem('cached_buyer_orders_dev-buyer-777693020');
      expect(cachedRaw).not.toBeNull();
      const cached = JSON.parse(cachedRaw || '{}');
      expect(Array.isArray(cached.orders)).toBe(true);
      const found = (cached.orders || []).some((o: any) => o.products?.name === 'Produit démo — Maïs');
      expect(found).toBe(true);
    });

    // UI: buyer should now see the new order in their dashboard orders list
    expect(await screen.findByText('Produit démo — Maïs')).toBeInTheDocument();

    // also ensure a dev_order_x key exists for the test-order
    const devOrderKey = Object.keys(localStorage).find(k => /^dev_order_(test-order-)/.test(k));
    expect(devOrderKey).toBeDefined();
    const devOrder = JSON.parse(localStorage.getItem(devOrderKey!) || '{}');
    expect(devOrder.products?.name).toBe('Produit démo — Maïs');
  });

  test('multiple fictive payments produce multiple visible orders', async () => {
    localStorage.setItem('sms_auth_session', JSON.stringify({ profileId: 'dev-buyer-777693020', role: 'buyer', phone: '+221777693020' }));

    render(
      <MemoryRouter initialEntries={["/buyer"]}>
        <TooltipProvider>
          <BuyerDashboard />
        </TooltipProvider>
      </MemoryRouter>
    );

    const input = await screen.findByPlaceholderText('Code produit...');

    // first fake payment
    fireEvent.change(input, { target: { value: 'PD-DEV-1' } });
    fireEvent.submit(input.closest('form')!);
    const payBtn1 = await screen.findByRole('button', { name: /Payer avec Wave/i });
    fireEvent.click(payBtn1);

    // wait for first order to appear
    await waitFor(() => expect(screen.getByText('Produit démo — Maïs')).toBeInTheDocument());

    // second fake payment (repeat the flow)
    fireEvent.change(input, { target: { value: 'PD-DEV-1' } });
    fireEvent.submit(input.closest('form')!);
    const payBtn2 = await screen.findByRole('button', { name: /Payer avec Wave/i });
    fireEvent.click(payBtn2);

    // assert: at least two order entries are visible for the demo product
    await waitFor(async () => {
      const orders = await screen.findAllByText('Produit démo — Maïs');
      expect(orders.length).toBeGreaterThanOrEqual(2);
    });

    // ensure multiple dev_order_ keys exist
    const devOrderKeys = Object.keys(localStorage).filter(k => /^dev_order_test-order-/.test(k));
    expect(devOrderKeys.length).toBeGreaterThanOrEqual(2);
  });
});