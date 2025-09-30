"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  markNotificationRead,
  type NotificationListResponse,
  type NotificationRecord,
} from "../lib/api";
import { useNotifications } from "../lib/useNotifications";
import { useToast } from "./ToastProvider";

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function formatTimestamp(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function isUnread(notification: NotificationRecord): boolean {
  return !notification.readAt;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const { showToast } = useToast();

  const {
    notifications,
    unreadCount,
    error,
    isLoading,
    isValidating,
    hasMore,
    loadMore,
    mutate,
  } = useNotifications();

  const hasUnread = unreadCount > 0;

  const closePanel = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent | globalThis.MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!panelRef.current || !buttonRef.current) return;
      if (panelRef.current.contains(target) || buttonRef.current.contains(target)) {
        return;
      }
      closePanel();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePanel();
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePanel, open]);

  const toggleOpen = useCallback(() => {
    setOpen((previous) => !previous);
  }, []);

  const formattedNotifications = useMemo(() => {
    return notifications.map((notification) => {
      const title = getString(notification.payload?.title) ?? "Notification";
      const body = getString(notification.payload?.body);
      const url = getString(notification.payload?.url);
      return {
        ...notification,
        title,
        body,
        url,
      };
    });
  }, [notifications]);

  const handleMarkRead = useCallback(
    async (id: string) => {
      if (marking.has(id)) {
        return;
      }
      setMarking((current) => new Set(current).add(id));
      try {
        await markNotificationRead(id);
        await mutate((pages: NotificationListResponse[] | undefined) => {
          if (!pages) return pages;
          let updated = false;
          const nextPages = pages.map((page, pageIndex) => {
            const nextItems = page.items.map((item) => {
              if (item.id !== id) return item;
              if (item.readAt) return item;
              updated = true;
              return { ...item, readAt: new Date().toISOString() };
            });
            if (!updated) {
              return page;
            }
            if (pageIndex === 0) {
              return {
                ...page,
                items: nextItems,
                unreadCount: Math.max(0, page.unreadCount - 1),
              };
            }
            return { ...page, items: nextItems };
          });
          return updated ? nextPages : pages;
        }, false);
        await mutate();
      } catch (err) {
        console.error("Failed to mark notification as read", err);
        showToast({
          message: "Failed to mark notification as read. Please try again.",
          variant: "error",
        });
      } finally {
        setMarking((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    },
    [marking, mutate, showToast],
  );

  const renderContent = () => {
    if (isLoading) {
      return <p className="notification-panel__status">Loading notifications…</p>;
    }
    if (error) {
      return (
        <p className="notification-panel__status notification-panel__status--error">
          We couldn&apos;t load notifications.
        </p>
      );
    }
    if (!formattedNotifications.length) {
      return (
        <p className="notification-panel__status">No notifications yet.</p>
      );
    }
    return (
      <ul className="notification-panel__list">
        {formattedNotifications.map((notification) => {
          const unread = isUnread(notification);
          return (
            <li
              key={notification.id}
              className={`notification-panel__item${
                unread ? " notification-panel__item--unread" : ""
              }`}
            >
              <div className="notification-panel__item-main">
                <span className="notification-panel__title">{notification.title}</span>
                {notification.body ? (
                  <p className="notification-panel__body">{notification.body}</p>
                ) : null}
                <time
                  className="notification-panel__timestamp"
                  dateTime={notification.createdAt}
                >
                  {formatTimestamp(notification.createdAt)}
                </time>
              </div>
              <div className="notification-panel__item-actions">
                {notification.url ? (
                  <Link
                    href={notification.url}
                    className="notification-panel__link"
                    onClick={closePanel}
                  >
                    View
                  </Link>
                ) : null}
                {unread ? (
                  <button
                    type="button"
                    className="notification-panel__action"
                    onClick={() => void handleMarkRead(notification.id)}
                    disabled={marking.has(notification.id)}
                  >
                    {marking.has(notification.id) ? "Marking…" : "Mark as read"}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="nav-notifications">
      <button
        ref={buttonRef}
        type="button"
        className={`notification-bell${hasUnread ? " notification-bell--unread" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="notification-panel"
        onClick={toggleOpen}
      >
        <span aria-hidden="true">🔔</span>
        <span className="sr-only">Notifications</span>
        {hasUnread ? (
          <span className="notification-bell__badge" aria-label={`${unreadCount} unread notifications`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          ref={panelRef}
          id="notification-panel"
          role="dialog"
          aria-label="Notifications"
          className="notification-panel"
        >
          <div className="notification-panel__header">
            <span className="notification-panel__heading">Notifications</span>
            <button
              type="button"
              className="notification-panel__close"
              onClick={closePanel}
              aria-label="Close notifications"
            >
              ×
            </button>
          </div>
          <div className="notification-panel__content">{renderContent()}</div>
          <div className="notification-panel__footer">
            <span className="notification-panel__status">
              {isValidating ? "Refreshing…" : ""}
            </span>
            <button
              type="button"
              className="notification-panel__action"
              onClick={() => void loadMore()}
              disabled={!hasMore || isValidating}
            >
              {hasMore ? (isValidating ? "Loading…" : "Load more") : "End of notifications"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
