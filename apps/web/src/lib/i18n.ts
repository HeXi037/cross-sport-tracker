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
export const NEUTRAL_FALLBACK_LOCALE = 'en-GB';

export function getStoredLocale(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage?.getItem(LOCALE_STORAGE_KEY);
    const normalized = normalizeLocale(raw, '');
    return normalized || null;
  } catch {
    return null;
  }
}

export function storeLocalePreference(locale: string | null | undefined): void {
  if (typeof window === 'undefined') {
    return;
  }
  const normalized = normalizeLocale(locale, '');
  if (!normalized) {
    return;
  }
  try {
    window.localStorage?.setItem(LOCALE_STORAGE_KEY, normalized);
  } catch {
    // Ignore storage quota errors or unavailable localStorage.
  }
}

const SAMPLE_DATE = new Date(2001, 10, 21);

export function getDatePlaceholder(
  locale: string | null | undefined,
): string {
  const normalized = normalizeLocale(locale);
  const lower = normalized.toLowerCase();
  const isAustralian = lower === 'en-au' || lower.startsWith('en-au-');
  const australianFallback = 'dd/mm/yyyy';

  try {
    const formatter = new Intl.DateTimeFormat(normalized, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const parts = formatter.formatToParts(SAMPLE_DATE);
    const placeholder = parts
      .map((part) => {
        if (part.type === 'day') return 'dd';
        if (part.type === 'month') return 'mm';
        if (part.type === 'year') return 'yyyy';
        return part.value;
      })
      .join('');

    if (isAustralian) {
      const monthIndex = placeholder.indexOf('mm');
      const dayIndex = placeholder.indexOf('dd');
      if (monthIndex !== -1 && dayIndex !== -1 && monthIndex < dayIndex) {
        return australianFallback;
      }
    }

    return placeholder;
  } catch {
    return isAustralian ? australianFallback : 'yyyy-mm-dd';
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
