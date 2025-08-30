// apps/web/src/lib/api.ts
export function apiBase(): string {
  const server = typeof window === 'undefined';
  const base = server
    ? process.env.INTERNAL_API_BASE_URL || 'http://backend:8000/api'
    : process.env.NEXT_PUBLIC_API_BASE_URL || '/api';
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

export function apiUrl(path: string): string {
  const b = apiBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

export class ApiError extends Error {
  status?: number;
  body?: unknown;
  constructor(message: string, status?: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch(path: string, init?: RequestInit) {
  try {
    const res = await fetch(apiUrl(path), init);
    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        try {
          body = await res.text();
        } catch {
          body = undefined;
        }
      }
      throw new ApiError(
        `Request failed with status ${res.status}`,
        res.status,
        body,
      );
    }
    return res;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Network request failed');
  }
}
