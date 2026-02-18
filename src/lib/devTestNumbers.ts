export const DEV_TEST_LAST9S = ['777693020', '777603020'];

export function normalizePhoneLast9(raw?: string | null) {
  if (!raw) return '';
  return String(raw).replace(/\D/g, '').slice(-9);
}

export function isDevTestNumber(raw?: string | null) {
  try {
    const last9 = normalizePhoneLast9(raw);
    return DEV_TEST_LAST9S.includes(last9);
  } catch (e) {
    return false;
  }
}
