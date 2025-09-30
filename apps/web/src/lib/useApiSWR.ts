import useSWR, {
  mutate,
  type Key,
  type MutateOptions,
  type SWRConfiguration,
  type SWRResponse,
} from 'swr';
import { apiFetch, type ApiError } from './api';

const API_CACHE_KEY_PREFIX = 'api:';
const DEFAULT_DEDUPING_INTERVAL = 60_000;

function headersToObject(headers?: HeadersInit): Record<string, string> | undefined {
  if (!headers) return undefined;
  if (headers instanceof Headers) {
    const entries: [string, string][] = [];
    headers.forEach((value, key) => {
      entries.push([key, value]);
    });
    return Object.fromEntries(
      entries.sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    );
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(
      headers
        .map(([key, value]) => [key, value] as const)
        .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    );
  }
  const normalized = Object.entries(headers).sort(([a], [b]) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
  return Object.fromEntries(normalized);
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, entry]) => [key, entry] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`;
}

function normalizeInit(init?: RequestInit): Record<string, unknown> | undefined {
  if (!init) return undefined;
  const { method, cache, credentials, mode, redirect, referrer, referrerPolicy, next } = init;
  const headers = headersToObject(init.headers);
  const normalized = removeUndefined({
    method,
    cache,
    credentials,
    mode,
    redirect,
    referrer,
    referrerPolicy,
    next,
    headers,
  });
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function getApiCacheKey(path: string, init?: RequestInit): string {
  const normalizedInit = normalizeInit(init);
  if (!normalizedInit) {
    return `${API_CACHE_KEY_PREFIX}${path}`;
  }
  return `${API_CACHE_KEY_PREFIX}${path}?${stableStringify(normalizedInit)}`;
}

async function defaultParse<T>(response: Response): Promise<T> {
  const contentType = response.headers?.get?.('content-type') ?? '';
  if (contentType.toLowerCase().includes('application/json')) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}

type Matcher = string | RegExp | ((key: string) => boolean);

type UseApiSWRConfig<T> = {
  init?: RequestInit;
  parse?: (response: Response) => Promise<T>;
  swr?: SWRConfiguration<T, ApiError>;
};

function matchesNormalizedKey(normalizedKey: string, matcher: Matcher): boolean {
  if (typeof matcher === 'string') {
    return normalizedKey === matcher;
  }
  if (matcher instanceof RegExp) {
    return matcher.test(normalizedKey);
  }
  return matcher(normalizedKey);
}

export function useApiSWR<T>(
  path: string | null,
  config?: UseApiSWRConfig<T>,
): SWRResponse<T, ApiError> {
  const { init, parse = defaultParse, swr } = config ?? {};
  const key = path ? getApiCacheKey(path, init) : null;
  return useSWR<T, ApiError>(
    key,
    path
      ? async () => {
          const response = await apiFetch(path, init);
          return parse(response);
        }
      : null,
    {
      dedupingInterval: DEFAULT_DEDUPING_INTERVAL,
      keepPreviousData: true,
      revalidateOnFocus: true,
      ...(swr ?? {}),
    },
  );
}

export async function invalidateApiResource(
  matcher: Matcher,
  options?: Partial<MutateOptions<unknown, ApiError>>,
) {
  await mutate(
    (key: Key) => {
      if (typeof key !== 'string') return false;
      if (!key.startsWith(API_CACHE_KEY_PREFIX)) return false;
      const normalized = key.slice(API_CACHE_KEY_PREFIX.length);
      return matchesNormalizedKey(normalized, matcher);
    },
    undefined,
    { revalidate: true, ...(options ?? {}) },
  );
}

export function invalidateMatchesCache(options?: Partial<MutateOptions<unknown, ApiError>>) {
  return invalidateApiResource((key) => key.includes('/v0/matches'), options);
}
