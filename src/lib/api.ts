export const API_BASE = import.meta.env.VITE_API_URL || '';

export const apiUrl = (path: string) => {
  if (!path.startsWith('/')) path = `/${path}`;
  // If API_BASE is empty, return path as-is (use relative for local dev)
  return `${API_BASE}${path}`;
};
