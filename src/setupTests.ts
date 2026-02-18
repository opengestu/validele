import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock PayDunyaService to avoid importing axios during unit tests
vi.mock('@/services/paydunya', () => ({
  PayDunyaService: class {
    async createPayment() { return { status: 'success', redirect_url: '' }; }
    async makePayment() { return { status: 'success' }; }
  }
}));

// Mock window.location.replace to prevent actual navigation during tests
Object.defineProperty(window, 'location', {
  value: {
    href: '/',
    replace: (p: string) => { (window.location as any).href = p; },
  },
  writable: true,
});

// Simple localStorage mock is not necessary (jsdom provides it), but ensure clear before each test
beforeEach(() => {
  localStorage.clear();
});