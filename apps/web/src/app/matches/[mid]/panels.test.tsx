import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import ChatPanel from "./ChatPanel";
import CommentsPanel from "./CommentsPanel";
import enMessages from "../../../messages/en-GB.json";
import esMessages from "../../../messages/es-ES.json";

const apiMocks = vi.hoisted(() => ({
  isLoggedIn: vi.fn(() => false),
  currentUserId: vi.fn(() => null),
  isAdmin: vi.fn(() => false),
  apiFetch: vi.fn(),
}));

vi.mock("../../../lib/api", () => ({
  SESSION_CHANGED_EVENT: "SESSION_CHANGED_EVENT",
  SESSION_ENDED_EVENT: "SESSION_ENDED_EVENT",
  apiFetch: apiMocks.apiFetch,
  currentUserId: apiMocks.currentUserId,
  isAdmin: apiMocks.isAdmin,
  isLoggedIn: apiMocks.isLoggedIn,
}));

vi.mock("../../../lib/useApiSWR", () => ({
  useApiSWR: () => ({
    data: { items: [] },
    error: null,
    isLoading: false,
    isValidating: false,
    mutate: vi.fn(),
  }),
}));

vi.mock("../../../lib/LocaleContext", () => ({
  useLocale: () => "en-GB",
  useTimeZone: () => "UTC",
}));

describe("Match panels localization", () => {
  beforeEach(() => {
    apiMocks.isLoggedIn.mockReturnValue(false);
  });

  it("shows chat helper text and placeholder for guests in English", () => {
    render(
      <NextIntlClientProvider locale="en-GB" messages={enMessages}>
        <ChatPanel matchId="m1" />
      </NextIntlClientProvider>
    );

    expect(
      screen.getByText("Log in to chat with other fans.")
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Log in to chat")).toBeInTheDocument();
    expect(screen.getByText("No chat yet.")).toBeInTheDocument();
  });

  it("shows comments helper text and placeholder for guests in Spanish", () => {
    render(
      <NextIntlClientProvider locale="es-ES" messages={esMessages}>
        <CommentsPanel matchId="m1" />
      </NextIntlClientProvider>
    );

    expect(
      screen.getByText("Inicia sesión para unirte a la conversación.")
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Inicia sesión para comentar")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Todavía no hay comentarios.")
    ).toBeInTheDocument();
  });
});
