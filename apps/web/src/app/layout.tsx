// apps/web/src/app/layout.tsx
import './globals.css';
import Header from './header';
import ChunkErrorReload from '../components/ChunkErrorReload';
import ToastProvider from '../components/ToastProvider';
import SessionBanner from '../components/SessionBanner';
import LocalizedMessagesProvider from '../components/LocalizedMessagesProvider';
import { cookies } from 'next/headers';
import { createTranslator } from 'use-intl';
import Script from 'next/script';
import type enMessages from '../messages/en-GB.json';
import { LocaleProvider } from '../lib/LocaleContext';
import { resolveServerLocale } from '../lib/server-locale';
import { loadLocaleMessages } from '../i18n/messages';
import {
  LOCALE_COOKIE_KEY,
  LOCALE_STORAGE_KEY,
  NEUTRAL_FALLBACK_LOCALE,
  TIME_ZONE_COOKIE_KEY,
  TIME_ZONE_STORAGE_KEY,
} from '../lib/i18n';

const LOCALE_DETECTION_SCRIPT = `(() => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const localeStorageKey = '${LOCALE_STORAGE_KEY}';
  const localeCookieKey = '${LOCALE_COOKIE_KEY}';
  const timeZoneStorageKey = '${TIME_ZONE_STORAGE_KEY}';
  const timeZoneCookieKey = '${TIME_ZONE_COOKIE_KEY}';
  const neutralFallbackLocale = '${NEUTRAL_FALLBACK_LOCALE}';

  const australianTimeZonePrefix = 'australia/';
  const additionalAustralianTimeZones = new Set(['antarctica/macquarie']);

  const oneYearSeconds = 60 * 60 * 24 * 365;

  const decode = (value) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  const readCookie = (key) => {
    const parts = document.cookie ? document.cookie.split(';') : [];
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith(key + '=')) {
        const [, cookieValue] = trimmed.split('=');
        return decode(cookieValue ?? '');
      }
    }
    return null;
  };

  const writeCookie = (key, value) => {
    try {
      const encoded = value ? encodeURIComponent(value) : '';
      const maxAge = value ? '; max-age=' + oneYearSeconds : '; max-age=0';
      document.cookie =
        key + '=' + encoded + '; path=/' + maxAge;
    } catch {
      // Ignore cookie write failures.
    }
  };

  const canonicalizeLocale = (value) => {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    const attempts = [trimmed, trimmed.replace(/_/g, '-')];
    for (const attempt of attempts) {
      try {
        const canonical = Intl.getCanonicalLocales(attempt)[0];
        if (canonical) {
          return canonical;
        }
      } catch {
        // Ignore invalid locale formats.
      }
    }

    return trimmed.replace(/_/g, '-');
  };

  const normalizeTimeZone = (value) => {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim();
    return trimmed;
  };

  const isAustralianTimeZone = (value) => {
    const normalized = normalizeTimeZone(value).toLowerCase();
    if (!normalized) {
      return false;
    }
    if (normalized.startsWith(australianTimeZonePrefix)) {
      return true;
    }
    return additionalAustralianTimeZones.has(normalized);
  };

  const persistLocale = (value) => {
    const normalized = canonicalizeLocale(value);
    if (!normalized) {
      return;
    }
    try {
      window.sessionStorage?.setItem(localeStorageKey, normalized);
    } catch {
      // Ignore storage quota errors.
    }
    try {
      window.localStorage?.setItem(localeStorageKey, normalized);
    } catch {
      // Ignore storage quota errors.
    }
    writeCookie(localeCookieKey, normalized);
    try {
      if (document.documentElement) {
        document.documentElement.lang = normalized;
      }
    } catch {
      // Ignore DOM update failures.
    }
  };

  const persistTimeZone = (value) => {
    const normalized = normalizeTimeZone(value);
    if (!normalized) {
      return;
    }
    try {
      window.sessionStorage?.setItem(timeZoneStorageKey, normalized);
    } catch {
      // Ignore storage quota errors.
    }
    try {
      window.localStorage?.setItem(timeZoneStorageKey, normalized);
    } catch {
      // Ignore storage quota errors.
    }
    writeCookie(timeZoneCookieKey, normalized);
  };

  const readStoredLocale = () => {
    const sources = [
      () => {
        try {
          return window.sessionStorage?.getItem(localeStorageKey) ?? '';
        } catch {
          return '';
        }
      },
      () => {
        try {
          return window.localStorage?.getItem(localeStorageKey) ?? '';
        } catch {
          return '';
        }
      },
      () => readCookie(localeCookieKey) ?? '',
    ];

    for (const getter of sources) {
      const result = canonicalizeLocale(getter());
      if (result) {
        return result;
      }
    }
    return '';
  };

  const readStoredTimeZone = () => {
    const sources = [
      () => {
        try {
          return window.sessionStorage?.getItem(timeZoneStorageKey) ?? '';
        } catch {
          return '';
        }
      },
      () => {
        try {
          return window.localStorage?.getItem(timeZoneStorageKey) ?? '';
        } catch {
          return '';
        }
      },
      () => readCookie(timeZoneCookieKey) ?? '',
    ];

    for (const getter of sources) {
      const result = normalizeTimeZone(getter());
      if (result) {
        return result;
      }
    }
    return '';
  };

  let storedLocale = readStoredLocale();
  let storedTimeZone = readStoredTimeZone();

  let detectedTimeZone = storedTimeZone;
  if (!detectedTimeZone && typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const normalized = normalizeTimeZone(resolved);
      if (normalized) {
        detectedTimeZone = normalized;
      }
    } catch {
      // Ignore detection failures.
    }
  }

  if (!storedTimeZone && detectedTimeZone) {
    persistTimeZone(detectedTimeZone);
    storedTimeZone = detectedTimeZone;
  }

  if (!storedLocale) {
    const candidates = [];
    if (Array.isArray(navigator.languages)) {
      for (const language of navigator.languages) {
        if (typeof language === 'string' && language) {
          candidates.push(language);
        }
      }
    }
    if (typeof navigator.language === 'string' && navigator.language) {
      candidates.push(navigator.language);
    }

    let detectedLocale = '';
    let australianCandidate = '';

    for (const candidate of candidates) {
      const canonical = canonicalizeLocale(candidate);
      if (!canonical) {
        continue;
      }
      if (!detectedLocale) {
        detectedLocale = canonical;
      }
      if (!australianCandidate && canonical.toLowerCase().startsWith('en-au')) {
        australianCandidate = canonical;
      }
    }

    if (australianCandidate) {
      detectedLocale = australianCandidate;
    }

    if (!detectedLocale && (storedTimeZone || detectedTimeZone)) {
      if (
        isAustralianTimeZone(storedTimeZone) ||
        isAustralianTimeZone(detectedTimeZone)
      ) {
        detectedLocale = 'en-AU';
      }
    }

    if (!detectedLocale) {
      detectedLocale = neutralFallbackLocale;
    }

    persistLocale(detectedLocale);
    storedLocale = detectedLocale;
  } else {
    try {
      if (document.documentElement) {
        document.documentElement.lang = storedLocale;
      }
    } catch {
      // Ignore DOM update failures.
    }
  }
})();`;

export const metadata = {
  title: 'cross-sport-tracker',
  description: 'Ongoing self-hosted project',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = cookies();
  const { locale, acceptLanguage, preferredTimeZone } = resolveServerLocale({
    cookieStore,
  });
  const {
    locale: resolvedLocale,
    messages,
  } = await loadLocaleMessages(locale);
  const translator = createTranslator<typeof enMessages>({
    locale: resolvedLocale,
    messages: messages as typeof enMessages,
  });

  return (
    <html lang={resolvedLocale}>
      <head>
        <Script
          id="cst-locale-detection"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: LOCALE_DETECTION_SCRIPT }}
        />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          {translator('Common.nav.skipToContent')}
        </a>
        <LocaleProvider
          locale={locale}
          acceptLanguage={acceptLanguage}
          timeZone={preferredTimeZone}
        >
          <LocalizedMessagesProvider
            initialLocale={resolvedLocale}
            initialMessages={messages}
          >
            <ToastProvider>
              <ChunkErrorReload />
              <Header />
              <SessionBanner />
              <div id="main-content" tabIndex={-1} className="skip-target">
                {children}
              </div>
            </ToastProvider>
          </LocalizedMessagesProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
