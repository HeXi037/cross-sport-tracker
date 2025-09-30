const LOGIN_REDIRECT_COOKIE = 'cst-login-redirect';
const COOKIE_MAX_AGE_SECONDS = 60 * 5;

function getDocument(): Document | null {
  return typeof document === 'undefined' ? null : document;
}

function getWindow(): Window | null {
  return typeof window === 'undefined' ? null : window;
}

function readCookie(doc: Document): string | null {
  const prefix = `${LOGIN_REDIRECT_COOKIE}=`;
  const entries = doc.cookie ? doc.cookie.split('; ') : [];
  for (const entry of entries) {
    if (entry.startsWith(prefix)) {
      const value = entry.slice(prefix.length);
      try {
        return decodeURIComponent(value);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function clearCookie(doc: Document, win: Window | null) {
  const secure = win?.location.protocol === 'https:' ? '; secure' : '';
  doc.cookie = `${LOGIN_REDIRECT_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
}

function writeCookie(doc: Document, win: Window, value: string) {
  const secure = win.location.protocol === 'https:' ? '; secure' : '';
  doc.cookie = `${LOGIN_REDIRECT_COOKIE}=${encodeURIComponent(
    value,
  )}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax${secure}`;
}

function normalizeTarget(raw: string | null, win: Window): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw, win.location.origin);
  } catch {
    return null;
  }
  if (url.origin !== win.location.origin) {
    return null;
  }
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (!path) return null;
  if (path === '/login' || path.startsWith('/login/')) {
    return null;
  }
  return path;
}

function currentPath(win: Window): string {
  return `${win.location.pathname}${win.location.search}${win.location.hash}`;
}

export function rememberLoginRedirect(target?: string | URL | null): void {
  const doc = getDocument();
  const win = getWindow();
  if (!doc || !win) return;
  const raw =
    target instanceof URL
      ? target.toString()
      : target ?? currentPath(win);
  const normalized = normalizeTarget(raw, win);
  if (!normalized) {
    clearCookie(doc, win);
    return;
  }
  writeCookie(doc, win, normalized);
}

export function rememberLoginReferrer(): void {
  const doc = getDocument();
  const win = getWindow();
  if (!doc || !win) return;
  rememberLoginRedirect(doc.referrer || null);
}

export function consumeLoginRedirect(): string | null {
  const doc = getDocument();
  const win = getWindow();
  if (!doc || !win) return null;
  const raw = readCookie(doc);
  clearCookie(doc, win);
  if (!raw) return null;
  return normalizeTarget(raw, win);
}

export function peekLoginRedirect(): string | null {
  const doc = getDocument();
  const win = getWindow();
  if (!doc || !win) return null;
  const raw = readCookie(doc);
  return normalizeTarget(raw, win);
}
