import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { MouseEvent, ReactNode } from "react";
import Header from "./header";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    className,
    "aria-current": ariaCurrent,
  }: {
    href: string;
    children: ReactNode;
    onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
    className?: string;
    "aria-current"?: string;
  }) => (
    <a
      href={href}
      className={className}
      aria-current={ariaCurrent}
      onClick={(event) => onClick?.(event)}
    >
      {children}
    </a>
  ),
}));

vi.mock("../lib/api", () => ({
  SESSION_CHANGED_EVENT: "SESSION_CHANGED_EVENT",
  SESSION_ENDED_EVENT: "SESSION_ENDED_EVENT",
  currentUsername: () => null,
  isAdmin: () => false,
  logout: vi.fn(),
}));

vi.mock("../lib/loginRedirect", () => ({
  rememberLoginRedirect: vi.fn(),
}));

vi.mock("../components/NotificationBell", () => ({
  default: () => <div data-testid="notification-bell" />,
}));

vi.mock("../components/LanguageSelector", () => ({
  default: () => <div data-testid="language-selector" />,
}));

vi.mock("../components/ThemeProvider", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("Header navigation", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("navigates on the first click for desktop nav links", () => {
    render(<Header />);

    fireEvent.click(screen.getByRole("link", { name: "links.record" }));
    expect(pushMock).toHaveBeenCalledWith("/record/");
    expect(pushMock).toHaveBeenCalledTimes(1);
    pushMock.mockClear();

    fireEvent.click(screen.getByRole("link", { name: "links.players" }));
    expect(pushMock).toHaveBeenCalledWith("/players/");
    expect(pushMock).toHaveBeenCalledTimes(1);
    pushMock.mockClear();

    fireEvent.click(screen.getByRole("link", { name: "links.leaderboards" }));
    expect(pushMock).toHaveBeenCalledWith("/leaderboard/");
    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  it("navigates on the first click when the mobile menu is open", () => {
    render(<Header />);
    const menuToggle = screen.getByRole("button", { name: "nav.toggle" });

    fireEvent.click(menuToggle);
    fireEvent.click(screen.getByRole("link", { name: "links.record" }));
    expect(pushMock).toHaveBeenCalledWith("/record/");
    expect(pushMock).toHaveBeenCalledTimes(1);

    pushMock.mockClear();
    fireEvent.click(menuToggle);
    fireEvent.click(screen.getByRole("link", { name: "links.players" }));
    expect(pushMock).toHaveBeenCalledWith("/players/");
    expect(pushMock).toHaveBeenCalledTimes(1);

    pushMock.mockClear();
    fireEvent.click(menuToggle);
    fireEvent.click(screen.getByRole("link", { name: "links.leaderboards" }));
    expect(pushMock).toHaveBeenCalledWith("/leaderboard/");
    expect(pushMock).toHaveBeenCalledTimes(1);
  });
});
