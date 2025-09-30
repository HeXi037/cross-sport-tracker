import { useCallback, useMemo } from "react";
import useSWRInfinite, {
  type SWRInfiniteKeyLoader,
  type SWRInfiniteKeyedMutator,
} from "swr/infinite";
import { mutate as swrMutate } from "swr";
import {
  listNotifications,
  type ApiError,
  type NotificationListResponse,
  type NotificationRecord,
} from "./api";

type NotificationPages = NotificationListResponse[];

type UseNotificationsOptions = {
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 20;
const NOTIFICATION_CACHE_KEY_PREFIX = "notifications|list";

function buildPageKey(limit: number, offset: number): string {
  return `${NOTIFICATION_CACHE_KEY_PREFIX}|${limit}|${offset}`;
}

const fetchNotificationPage: (key: string) => Promise<NotificationListResponse> = async (
  key: string,
) => {
  const [, limitValue, offsetValue] = key.split("|");
  const limit = Number.parseInt(limitValue ?? "", 10) || DEFAULT_PAGE_SIZE;
  const offset = Number.parseInt(offsetValue ?? "", 10) || 0;
  return listNotifications(limit, offset);
};

export function useNotifications(
  options?: UseNotificationsOptions,
): {
  notifications: NotificationRecord[];
  unreadCount: number;
  error: ApiError | undefined;
  isLoading: boolean;
  isValidating: boolean;
  hasMore: boolean;
  loadMore: () => Promise<NotificationPages | undefined>;
  mutate: SWRInfiniteKeyedMutator<NotificationPages>;
  refresh: () => Promise<NotificationPages | undefined>;
} {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;

  const getKey: SWRInfiniteKeyLoader = useCallback(
    (index: number, previousPageData: NotificationListResponse | null) => {
      if (previousPageData && previousPageData.items.length < pageSize) {
        return null;
      }
      const offset = index * pageSize;
      return buildPageKey(pageSize, offset);
    },
    [pageSize],
  );

  const {
    data,
    error,
    isLoading,
    isValidating,
    size,
    setSize,
    mutate,
  } = useSWRInfinite<NotificationListResponse, ApiError>(getKey, fetchNotificationPage, {
    revalidateFirstPage: true,
    revalidateOnFocus: true,
    persistSize: true,
  });

  const notifications = useMemo(
    () => data?.flatMap((page) => page.items) ?? [],
    [data],
  );

  const unreadCount = data?.[0]?.unreadCount ?? 0;
  const lastPageLength = data?.[data.length - 1]?.items.length ?? 0;
  const hasMore = Boolean(data && lastPageLength === pageSize);

  const loadMore = useCallback(() => {
    if (!hasMore) {
      return Promise.resolve(data);
    }
    return setSize((current) => current + 1);
  }, [data, hasMore, setSize]);

  const refresh = useCallback(() => mutate(), [mutate]);

  return {
    notifications,
    unreadCount,
    error,
    isLoading: !data && isLoading,
    isValidating,
    hasMore,
    loadMore,
    mutate,
    refresh,
  };
}

export function invalidateNotificationsCache() {
  return swrMutate(
    (key) =>
      typeof key === "string" &&
      (key === NOTIFICATION_CACHE_KEY_PREFIX ||
        key.startsWith(`${NOTIFICATION_CACHE_KEY_PREFIX}|`)),
    undefined,
    { revalidate: true },
  );
}

export const notificationsInternal = {
  buildPageKey,
  NOTIFICATION_CACHE_KEY_PREFIX,
};
