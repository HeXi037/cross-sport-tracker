export function getInitials(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return '?';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '?';
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    const fallback = parts[0].slice(0, 2);
    return fallback ? fallback.toUpperCase() : '?';
  }
  const primary = parts
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('');
  if (primary) {
    return primary.toUpperCase();
  }
  const fallback = parts[0].slice(0, 2);
  return fallback ? fallback.toUpperCase() : '?';
}
