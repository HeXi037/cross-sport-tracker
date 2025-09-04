import { isAdmin } from './api';

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
