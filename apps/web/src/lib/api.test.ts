import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiFetch,
  isAdmin,
  logout,
  persistSession,
  SESSION_ENDED_STORAGE_KEY,
} from './api';

function buildToken(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const base64 = btoa(json);
  const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `e30.${base64url}.sig`;
}

describe('isAdmin', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('returns true when token has is_admin true', () => {
    const token = buildToken({ is_admin: true, char: 'ÿ' });
    window.localStorage.setItem('token', token);
    expect(isAdmin()).toBe(true);
  });

  it('returns false when token has is_admin false', () => {
    const token = buildToken({ is_admin: false });
    window.localStorage.setItem('token', token);
    expect(isAdmin()).toBe(false);
  });

  it('returns false for malformed token', () => {
    window.localStorage.setItem('token', 'bad.token');
    expect(isAdmin()).toBe(false);
  });
});

describe('persistSession', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('stores access and refresh tokens and clears session flags', () => {
    window.localStorage.setItem(
      SESSION_ENDED_STORAGE_KEY,
      JSON.stringify({ reason: 'expired', timestamp: Date.now() })
    );

    persistSession({ access_token: 'abc', refresh_token: 'def' });

    expect(window.localStorage.getItem('token')).toBe('abc');
    expect(window.localStorage.getItem('refresh_token')).toBe('def');
    expect(window.localStorage.getItem(SESSION_ENDED_STORAGE_KEY)).toBeNull();
  });
});

describe('logout', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('records a session end when expiring', () => {
    window.localStorage.setItem('token', 'abc');
    window.localStorage.setItem('refresh_token', 'def');

    logout('expired');

    expect(window.localStorage.getItem('token')).toBeNull();
    expect(window.localStorage.getItem('refresh_token')).toBeNull();
    const sessionEnd = window.localStorage.getItem(SESSION_ENDED_STORAGE_KEY);
    expect(sessionEnd).not.toBeNull();
    if (sessionEnd) {
      const parsed = JSON.parse(sessionEnd) as { reason?: string };
      expect(parsed.reason).toBe('expired');
    }
  });

  it('clears session end notices on manual logout', () => {
    window.localStorage.setItem('token', 'abc');
    window.localStorage.setItem(
      SESSION_ENDED_STORAGE_KEY,
      JSON.stringify({ reason: 'expired', timestamp: Date.now() })
    );

    logout();

    expect(window.localStorage.getItem('token')).toBeNull();
    expect(window.localStorage.getItem(SESSION_ENDED_STORAGE_KEY)).toBeNull();
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
    window.localStorage.setItem('token', 'abc');
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
    expect(window.localStorage.getItem('token')).toBeNull();
    const sessionEnd = window.localStorage.getItem(SESSION_ENDED_STORAGE_KEY);
    expect(sessionEnd).not.toBeNull();
    if (sessionEnd) {
      const parsed = JSON.parse(sessionEnd) as { reason?: string };
      expect(parsed.reason).toBe('expired');
    }
  });
});
