import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiBase,
  apiFetch,
  ensureAbsoluteApiUrl,
  isAdmin,
  logout,
  persistSession,
  SESSION_CHANGED_EVENT,
  SESSION_ENDED_EVENT,
  SESSION_ENDED_STORAGE_KEY,
} from './api';

const ORIGINAL_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;
const ORIGINAL_INTERNAL_API_BASE = process.env.INTERNAL_API_BASE_URL;

afterEach(() => {
  process.env.NEXT_PUBLIC_API_BASE_URL = ORIGINAL_API_BASE;
  process.env.INTERNAL_API_BASE_URL = ORIGINAL_INTERNAL_API_BASE;
});

const buildSessionHint = (payload: Record<string, unknown>): string =>
  btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('isAdmin', () => {
  afterEach(() => {
    document.cookie = '';
  });

  it('returns true when token has is_admin true', () => {
    const hint = buildSessionHint({ is_admin: true, username: 'test' });
    document.cookie = `session_hint=${hint}`;
    expect(isAdmin()).toBe(true);
  });

  it('returns false when token has is_admin false', () => {
    const hint = buildSessionHint({ is_admin: false });
    document.cookie = `session_hint=${hint}`;
    expect(isAdmin()).toBe(false);
  });

  it('returns false for malformed token', () => {
    document.cookie = `session_hint=bad.token`;
    expect(isAdmin()).toBe(false);
  });
});

describe('ensureAbsoluteApiUrl', () => {
  it('keeps API-hosted paths relative when the base URL is absolute', () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://backend:8000/api';

    expect(
      ensureAbsoluteApiUrl('/api/static/users/example.jpg')
    ).toBe('/api/static/users/example.jpg');
  });

  it('prefixes relative paths with the API base path without leaking the origin', () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://backend:8000/api';

    expect(ensureAbsoluteApiUrl('static/users/example.jpg')).toBe(
      '/api/static/users/example.jpg'
    );
  });
});

describe('apiBase', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    (globalThis as any).window = undefined;
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  it('uses INTERNAL_API_BASE_URL on the server', () => {
    process.env.INTERNAL_API_BASE_URL = 'https://internal.example.com/api/';
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://public.example.com/api/';

    expect(apiBase()).toBe('https://internal.example.com/api');
  });

  it('falls back to NEXT_PUBLIC_API_BASE_URL on the server', () => {
    delete process.env.INTERNAL_API_BASE_URL;
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://public.example.com/api/';

    expect(apiBase()).toBe('https://public.example.com/api');
  });

  it('throws a descriptive error when the API base is missing on the server', () => {
    delete process.env.INTERNAL_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;

    expect(() => apiBase()).toThrow(
      /API base URL is not configured.*INTERNAL_API_BASE_URL.*NEXT_PUBLIC_API_BASE_URL/i
    );
  });
});

describe('persistSession', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('clears session flags and emits a change event', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    window.localStorage.setItem(
      SESSION_ENDED_STORAGE_KEY,
      JSON.stringify({ reason: 'expired', timestamp: Date.now() })
    );

    persistSession();

    expect(window.localStorage.getItem(SESSION_ENDED_STORAGE_KEY)).toBeNull();
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: SESSION_CHANGED_EVENT })
    );
  });
});

describe('logout', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('records a session end when expiring', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));

    logout('expired');

    const sessionEnd = window.localStorage.getItem(SESSION_ENDED_STORAGE_KEY);
    expect(sessionEnd).not.toBeNull();
    if (sessionEnd) {
      const parsed = JSON.parse(sessionEnd) as { reason?: string };
      expect(parsed.reason).toBe('expired');
    }
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: SESSION_ENDED_EVENT })
    );
  });

  it('clears session end notices on manual logout', () => {
    window.localStorage.setItem(
      SESSION_ENDED_STORAGE_KEY,
      JSON.stringify({ reason: 'expired', timestamp: Date.now() })
    );
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));

    logout();

    expect(window.localStorage.getItem(SESSION_ENDED_STORAGE_KEY)).toBeNull();
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: SESSION_CHANGED_EVENT })
    );
  });
});

describe('apiFetch', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    document.cookie = '';
  });

  it('attaches CSRF tokens to mutating requests', async () => {
    document.cookie = 'csrf_token=csrf-token';
    const response = new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/mutate', { method: 'POST' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get('X-CSRF-Token')).toBe('csrf-token');
    expect(init?.credentials).toBe('include');
  });

  it('uses problem detail messages for RFC 7807 responses', async () => {
    const response = new Response(
      JSON.stringify({
        type: 'about:blank',
        title: 'Bad Request',
        detail: 'Validation failed',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/problem+json' },
      }
    );
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/error')).rejects.toMatchObject({
      message: 'HTTP 400: Validation failed',
      status: 400,
    });
  });

  it('falls back to plain text responses when JSON parsing fails', async () => {
    const response = new Response('Server exploded', { status: 500 });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/error')).rejects.toMatchObject({
      message: 'HTTP 500: Server exploded',
      status: 500,
    });
  });

  it('logs out when the token has expired', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const response = new Response(
      JSON.stringify({ detail: 'token expired' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/problem+json' },
      }
    );
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/error')).rejects.toMatchObject({
      message: 'HTTP 401: token expired',
      status: 401,
    });
    const sessionEnd = window.localStorage.getItem(SESSION_ENDED_STORAGE_KEY);
    expect(sessionEnd).not.toBeNull();
    if (sessionEnd) {
      const parsed = JSON.parse(sessionEnd) as { reason?: string };
      expect(parsed.reason).toBe('expired');
    }
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: SESSION_ENDED_EVENT })
    );
  });
});
