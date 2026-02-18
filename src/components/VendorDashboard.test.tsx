import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import VendorDashboard from './VendorDashboard';

vi.mock('@/hooks/useAuth', () => ({
  // provide a non-dev vendor session via `user` (or sms_auth_session) — tests use sms_auth_session below
  useAuth: () => ({ user: null, signOut: vi.fn(), userProfile: { full_name: 'Test Vendor', phone: '+221777693020' }, loading: false })
}));

describe('VendorDashboard — create & delete product (vendor session)', () => {
  let serverProducts: any[] = [];

  beforeEach(() => {
    localStorage.clear();
    serverProducts = [];

    // stub global fetch for vendor API endpoints used by VendorDashboard
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input || '');
      const initBodyRaw = init && (init as any).body ? (init as any).body : '{}';
      const parsedInitBody = typeof initBodyRaw === 'string' ? JSON.parse(initBodyRaw) : initBodyRaw;

      // list products
      if (url.includes('/api/vendor/products')) {
        return { ok: true, json: async () => ({ success: true, products: serverProducts }) } as unknown as Response;
      }
      // add product
      if (url.includes('/api/vendor/add-product')) {
        const prod = { id: `prod-${Date.now()}`, ...parsedInitBody };
        // ensure code exists for display
        prod.code = prod.code || `PD-${Math.floor(Math.random() * 9000) + 1000}`;
        serverProducts.unshift(prod);
        return { ok: true, json: async () => ({ success: true, product: prod }) } as unknown as Response;
      }
      // delete product
      if (url.includes('/api/vendor/delete-product')) {
        const body = parsedInitBody || {};
        serverProducts = serverProducts.filter(p => String(p.id) !== String(body.product_id));
        return { ok: true, json: async () => ({ success: true }) } as unknown as Response;
      }

      return { ok: true, json: async () => ({}) } as unknown as Response;
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  test('vendor can create then delete a product (no dev shortcuts)', async () => {
    // simulate a non-dev SMS-authenticated vendor session
    localStorage.setItem('sms_auth_session', JSON.stringify({ profileId: 'vendor-test-777693020', role: 'vendor', phone: '+221777693020', access_token: 'test-token' }));

    render(
      <MemoryRouter>
        <VendorDashboard />
      </MemoryRouter>
    );

    // initially no products
    expect(await screen.findByText(/Aucun produit/)).toBeInTheDocument();

    // Open add modal
    const addButtons = await screen.findAllByText(/Ajouter/);
    fireEvent.click(addButtons[0]);

    // Fill form (no dev-only code field expected)
    const nameInput = await screen.findByPlaceholderText('Ex: iPhone 13');
    const priceInput = await screen.findByPlaceholderText('Ex: 500000');
    const descInput = await screen.findByPlaceholderText('Décrivez votre produit...');

    fireEvent.change(nameInput, { target: { value: 'Produit Test CI' } });
    fireEvent.change(priceInput, { target: { value: '4200' } });
    fireEvent.change(descInput, { target: { value: 'Produit créé pendant le test' } });

    // Submit
    const submitBtn = screen.getAllByText('Ajouter').find(b => b.tagName === 'BUTTON');
    fireEvent.click(submitBtn!);

    // Wait for UI to refresh and show the new product
    await waitFor(async () => {
      expect(await screen.findByText('Produit Test CI')).toBeInTheDocument();
    });

    // Confirm product is shown (and shows a code)
    const codeEl = screen.getByText(/Code :/i);
    expect(codeEl).toBeInTheDocument();

    // Delete the product: click the product's Supprimer button and confirm
    const deleteBtns = screen.getAllByText('Supprimer');
    // the first visible 'Supprimer' in the product card should open the confirmation
    fireEvent.click(deleteBtns[0]);

    // Confirm deletion in dialog (dialog button text is also 'Supprimer')
    const confirmBtn = await screen.findAllByText('Supprimer');
    // pick the destructive one inside the dialog (last occurrence)
    fireEvent.click(confirmBtn[confirmBtn.length - 1]);

    // Wait for product to disappear
    await waitFor(() => {
      expect(screen.queryByText('Produit Test CI')).toBeNull();
    });
  });
});

describe('VendorDashboard — dev/test orders visibility (test mode)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('dev vendor sees test orders from localStorage', async () => {
    // Arrange: simulate dev vendor session
    localStorage.setItem('sms_auth_session', JSON.stringify({ profileId: 'dev-vendor-777693020', role: 'vendor', phone: '+221777693020', access_token: 'dev-token' }));
    // Seed a fake test order for this vendor
    const testOrder = {
      id: 'dev-order-123',
      vendor_id: 'dev-vendor-777693020',
      buyer_id: 'dev-buyer-777693020',
      product_id: 'dev-prod-1',
      total_amount: 1500,
      payment_method: 'wave',
      delivery_address: 'Dakar',
      buyer_phone: '+221777000000',
      order_code: 'DEV-ORDER-123',
      qr_code: 'dev-qr-123',
      status: 'paid',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      products: { name: 'Produit Test Dev' },
      profiles: { full_name: 'Dev Buyer', phone: '+221777000000' }
    };
    localStorage.setItem('dev_order_123', JSON.stringify(testOrder));

    render(
      <MemoryRouter>
        <VendorDashboard />
      </MemoryRouter>
    );

    // Assert: the test order is visible in the dashboard
    expect(await screen.findByText('Produit Test Dev')).toBeInTheDocument();
    expect(screen.getByText('DEV-ORDER-123')).toBeInTheDocument();
    expect(screen.getByText(/Dakar/)).toBeInTheDocument();
    expect(screen.getByText(/paid|Payée/i)).toBeInTheDocument();
  });
});