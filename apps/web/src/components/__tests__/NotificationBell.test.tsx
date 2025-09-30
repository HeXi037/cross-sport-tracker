import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SWRConfig } from "swr";
import { type ReactNode } from "react";
import ToastProvider from "../ToastProvider";
import NotificationBell from "../NotificationBell";

const apiMocks = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>(
    "../../lib/api"
  );
  return {
    ...actual,
    listNotifications: apiMocks.listNotifications,
    markNotificationRead: apiMocks.markNotificationRead,
  };
});

function renderBell() {
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <ToastProvider>
        <NotificationBell />
      </ToastProvider>
    </SWRConfig>,
  );
}

describe("NotificationBell", () => {
  beforeEach(() => {
    apiMocks.listNotifications.mockReset();
    apiMocks.markNotificationRead.mockReset();
    apiMocks.listNotifications.mockResolvedValue({ items: [], unreadCount: 0 });
    apiMocks.markNotificationRead.mockResolvedValue(undefined);
  });

  it("shows unread counts and notification details", async () => {
    apiMocks.listNotifications.mockResolvedValue({
      items: [
        {
          id: "n1",
          type: "profile_comment",
          payload: {
            title: "New profile comment",
            body: "Alice left a note",
            url: "/players/p1/",
          },
          createdAt: "2024-01-01T12:00:00Z",
          readAt: null,
        },
      ],
      unreadCount: 2,
    });

    renderBell();

    const button = await screen.findByRole("button", { name: "Notifications" });
    expect(await screen.findByLabelText("2 unread notifications")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(button);
    });

    expect(await screen.findByText("New profile comment")).toBeInTheDocument();
    expect(screen.getByText("Alice left a note")).toBeInTheDocument();
  });

  it("marks notifications as read and updates the badge", async () => {
    apiMocks.listNotifications
      .mockResolvedValueOnce({
        items: [
          {
            id: "n2",
            type: "match_recorded",
            payload: {
              title: "Match recorded",
              body: "A padel match was recorded.",
            },
            createdAt: "2024-02-01T09:00:00Z",
            readAt: null,
          },
        ],
        unreadCount: 1,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "n2",
            type: "match_recorded",
            payload: {
              title: "Match recorded",
              body: "A padel match was recorded.",
            },
            createdAt: "2024-02-01T09:00:00Z",
            readAt: "2024-02-01T10:00:00Z",
          },
        ],
        unreadCount: 0,
      });

    renderBell();

    const button = await screen.findByRole("button", { name: "Notifications" });
    expect(await screen.findByLabelText("1 unread notifications")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(button);
    });

    const markButton = await screen.findByRole("button", { name: "Mark as read" });
    await act(async () => {
      fireEvent.click(markButton);
    });

    await waitFor(() => {
      expect(apiMocks.markNotificationRead).toHaveBeenCalledWith("n2");
    });

    await waitFor(() => {
      expect(screen.queryByLabelText("1 unread notifications")).not.toBeInTheDocument();
    });
  });

  it("shows an error toast when marking a notification fails", async () => {
    apiMocks.listNotifications.mockResolvedValue({
      items: [
        {
          id: "n3",
          type: "profile_comment",
          payload: {
            title: "New comment",
          },
          createdAt: "2024-03-01T08:00:00Z",
          readAt: null,
        },
      ],
      unreadCount: 1,
    });
    apiMocks.markNotificationRead.mockRejectedValue(new Error("network error"));

    renderBell();

    const button = await screen.findByRole("button", { name: "Notifications" });
    await act(async () => {
      fireEvent.click(button);
    });

    const markButton = await screen.findByRole("button", { name: "Mark as read" });
    await act(async () => {
      fireEvent.click(markButton);
    });

    await waitFor(() => {
      expect(apiMocks.markNotificationRead).toHaveBeenCalledWith("n3");
    });

    expect(
      await screen.findByText(
        "Failed to mark notification as read. Please try again.",
      ),
    ).toBeInTheDocument();
  });
});
