export function parseAcceptLanguage(
  header: string | null | undefined,
  defaultLocale = 'en-US',
): string {
  if (!header) return defaultLocale;
  const locales = header
    .split(',')
    .map((part) => part.trim().split(';')[0])
    .filter(Boolean);
  return locales[0] ?? defaultLocale;
}

export function normalizeLocale(
  locale: string | null | undefined,
  fallback = 'en-US',
): string {
  return typeof locale === 'string' && locale.length > 0 ? locale : fallback;
}

export function formatDate(
  value: Date | string | number | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, options).format(date);
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
