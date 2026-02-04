const rawBase =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? '' : (import.meta.env.VITE_DEV_BACKEND || 'https://validele.onrender.com'));
export const API_BASE = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;

export const apiUrl = (path: string) => {
  if (!path.startsWith('/')) path = `/${path}`;
  // If API_BASE is empty, return path as-is (use relative for local dev)
  return `${API_BASE}${path}`;
};

type SafeJsonParseError = { __parseError: true; __raw: string };
export const safeJson = async (response: Response): Promise<unknown | SafeJsonParseError | null> => {
  const text = await response.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { __parseError: true, __raw: text };
  }
};

// Try multiple candidate endpoints for profile updates to handle different deployment base paths
export const postProfileUpdate = async (payload: Record<string, unknown>) => {
  const candidates = ['/auth/profile/update', '/api/auth/profile/update', '/profile/update'];
  let lastErr: unknown = null;
  for (const p of candidates) {
    const url = apiUrl(p);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        const json = await resp.json().catch(() => null);
        return { ok: true, json, url };
      }
      // If 404, try next candidate
      if (resp.status === 404) {
        lastErr = { status: resp.status };
        continue;
      }
      // other errors: return immediately
      const txt = await resp.text().catch(() => null);
      return { ok: false, error: { status: resp.status, body: txt }, url };
    } catch (err) {
      lastErr = err;
      continue;
    }
  }
  return { ok: false, error: lastErr, url: apiUrl(candidates[candidates.length - 1]) };
};

export const getProfileById = async (id: string) => {
  const candidates = [`/auth/profile/${id}`, `/api/auth/profile/${id}`, `/profile/${id}`];
  let lastErr: unknown = null;
  for (const p of candidates) {
    const url = apiUrl(p);
    try {
      const resp = await fetch(url, { method: 'GET' });
      if (resp.ok) {
        const json = await resp.json().catch(() => null);
        return { ok: true, json, url };
      }
      if (resp.status === 404) {
        lastErr = { status: resp.status };
        continue;
      }
      const txt = await resp.text().catch(() => null);
      return { ok: false, error: { status: resp.status, body: txt }, url };
    } catch (err) {
      lastErr = err;
      continue;
    }
  }
  return { ok: false, error: lastErr, url: apiUrl(candidates[candidates.length - 1]) };
};
