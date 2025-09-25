export function ensureTrailingSlash(path: string): string {
  if (!path) return '/';
  const [pathname, search = ''] = path.split('?');
  const normalizedPath =
    pathname === '/' || pathname.endsWith('/')
      ? pathname
      : `${pathname}/`;
  return search ? `${normalizedPath}?${search}` : normalizedPath;
}

export function recordPathForSport(sportId: string): string {
  const slug = sportId.replace(/_/g, '-');
  return ensureTrailingSlash(`/record/${slug}`);
}
