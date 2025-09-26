type LocalePreference = {
  locale: string;
  quality: number;
  order: number;
};

export function parseAcceptLanguage(
  header: string | null | undefined,
  defaultLocale = 'en-US',
): string {
  if (!header) return defaultLocale;

  const preferences = header
    .split(',')
    .map((part, index): LocalePreference | null => {
      const [rawLocale, ...params] = part.trim().split(';').map((value) => value.trim());
      if (!rawLocale) {
        return null;
      }

      let quality = 1;
      for (const param of params) {
        if (!param.startsWith('q=')) continue;
        const parsed = Number(param.slice(2));
        if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) {
          quality = parsed;
        }
      }

      const locale = rawLocale === '*' ? defaultLocale : rawLocale;

      return {
        locale,
        quality,
        order: index,
      };
    })
    .filter((pref): pref is LocalePreference => Boolean(pref));

  if (!preferences.length) {
    return defaultLocale;
  }

  const australianPreference = preferences
    .filter((pref) => pref.locale.toLowerCase().startsWith('en-au'))
    .sort((a, b) => {
      if (a.quality !== b.quality) {
        return b.quality - a.quality;
      }
      return a.order - b.order;
    })[0];

  if (australianPreference) {
    return australianPreference.locale;
  }

  const [topPreference] = preferences.sort((a, b) => {
    if (a.quality !== b.quality) {
      return b.quality - a.quality;
    }
    return a.order - b.order;
  });

  return topPreference?.locale ?? defaultLocale;
}

export function normalizeLocale(
  locale: string | null | undefined,
  fallback = 'en-US',
): string {
  if (typeof locale !== 'string') {
    return fallback;
  }
  const trimmed = locale.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export const LOCALE_STORAGE_KEY = 'cst:locale';
export const LOCALE_COOKIE_KEY = 'cst-preferred-locale';
export const NEUTRAL_FALLBACK_LOCALE = 'en-GB';

export function getStoredLocale(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage?.getItem(LOCALE_STORAGE_KEY);
    const normalized = normalizeLocale(raw, '');
    if (normalized) {
      return normalized;
    }
  } catch {
    // Ignore storage errors and fall through to cookie lookup.
  }

  if (typeof document !== 'undefined') {
    try {
      const cookieValue = document.cookie
        .split(';')
        .map((value) => value.trim())
        .find((part) => part.startsWith(`${LOCALE_COOKIE_KEY}=`));
      if (cookieValue) {
        const [, value] = cookieValue.split('=');
        const normalized = normalizeLocale(decodeURIComponent(value ?? ''), '');
        return normalized || null;
      }
    } catch {
      // Ignore cookie parsing failures.
    }
  }

  return null;
}

export function storeLocalePreference(locale: string | null | undefined): void {
  if (typeof window === 'undefined' && typeof document === 'undefined') {
    return;
  }
  const normalized = normalizeLocale(locale, '');

  if (typeof window !== 'undefined') {
    try {
      if (normalized) {
        window.localStorage?.setItem(LOCALE_STORAGE_KEY, normalized);
      } else {
        window.localStorage?.removeItem(LOCALE_STORAGE_KEY);
      }
    } catch {
      // Ignore storage quota errors or unavailable localStorage.
    }
  }

  if (typeof document !== 'undefined') {
    const expires = normalized ? `; max-age=${60 * 60 * 24 * 365}` : '; max-age=0';
    try {
      document.cookie = `${LOCALE_COOKIE_KEY}=${
        normalized ? encodeURIComponent(normalized) : ''
      }; path=/${expires}`;
    } catch {
      // Ignore cookie write errors.
    }
  }
}

export function clearStoredLocale(): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage?.removeItem(LOCALE_STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }
  if (typeof document !== 'undefined') {
    try {
      document.cookie = `${LOCALE_COOKIE_KEY}=; path=/; max-age=0`;
    } catch {
      // Ignore cookie errors.
    }
  }
}

const SAMPLE_DATE = new Date(2001, 10, 21);
const SAMPLE_TIME = new Date(Date.UTC(2001, 10, 21, 9, 0));

export function getDatePlaceholder(
  locale: string | null | undefined,
): string {
  const normalized = normalizeLocale(locale);
  const lower = normalized.toLowerCase();
  const isAustralian = lower === 'en-au' || lower.startsWith('en-au-');
  const australianFallback = 'DD/MM/YYYY';

  try {
    const formatter = new Intl.DateTimeFormat(normalized, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const parts = formatter.formatToParts(SAMPLE_DATE);
    const placeholderLower = parts
      .map((part) => {
        if (part.type === 'day') return 'dd';
        if (part.type === 'month') return 'mm';
        if (part.type === 'year') return 'yyyy';
        return part.value;
      })
      .join('');

    const monthIndex = placeholderLower.indexOf('mm');
    const dayIndex = placeholderLower.indexOf('dd');
    const dayFirst = dayIndex !== -1 && monthIndex !== -1 && dayIndex < monthIndex;

    if (isAustralian && monthIndex !== -1 && dayIndex !== -1 && monthIndex < dayIndex) {
      return australianFallback;
    }

    if (dayFirst) {
      return 'DD/MM/YYYY';
    }

    return placeholderLower
      .replace(/d/g, 'D')
      .replace(/m/g, 'M')
      .replace(/y/g, 'Y');
  } catch {
    return isAustralian
      ? australianFallback
      : 'YYYY-MM-DD';
  }
}

export function usesTwentyFourHourClock(
  locale: string | null | undefined,
): boolean {
  const normalized = normalizeLocale(locale);
  try {
    const formatter = new Intl.DateTimeFormat(normalized, {
      hour: 'numeric',
      minute: 'numeric',
    });
    const parts = formatter.formatToParts(SAMPLE_TIME);
    return !parts.some((part) => part.type === 'dayPeriod');
  } catch {
    return true;
  }
}

export function formatDate(
  value: Date | string | number | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const normalizedLocale = normalizeLocale(locale, '');

  if (normalizedLocale) {
    try {
      return new Intl.DateTimeFormat(normalizedLocale, options).format(date);
    } catch {
      // Fall through to neutral formatting.
    }
  }

  const usesStyles = 'dateStyle' in options || 'timeStyle' in options;
  const fallbackOptions: Intl.DateTimeFormatOptions = usesStyles
    ? {
        dateStyle: 'medium',
        ...(options.timeStyle ? { timeStyle: 'short' } : {}),
      }
    : { day: '2-digit', month: 'short', year: 'numeric' };

  try {
    return new Intl.DateTimeFormat(NEUTRAL_FALLBACK_LOCALE, fallbackOptions).format(date);
  } catch {
    const day = String(date.getDate()).padStart(2, '0');
    const month = date
      .toLocaleString('en-US', { month: 'short' })
      .replace('.', '');
    const year = date.getFullYear();
    const datePart = `${day} ${month} ${year}`;
    if (options.timeStyle) {
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${datePart}, ${hours}:${minutes}`;
    }
    return datePart;
  }
}

export function formatDateTime(
  value: Date | string | number | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  },
): string {
  return formatDate(value, locale, options);
}
