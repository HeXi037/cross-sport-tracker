import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api", async () => ({
  ...(await vi.importActual<typeof import("../../lib/api")>(
    "../../lib/api",
  )),
  apiFetch,
}));

import RecordPage from "./page";

describe("RecordPage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("lists implemented sports even when the API returns slug ids", async () => {
    apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "disc-golf", name: "Disc Golf" },
        { id: "padel", name: "Padel" },
      ],
    } as unknown as Response);

    render(await RecordPage());

    expect(
      screen.getByRole("link", { name: "Disc Golf" }),
    ).toHaveAttribute("href", "/record/disc-golf");
    expect(
      screen.getByRole("link", { name: "Padel" }),
    ).toHaveAttribute("href", "/record/padel");
  });

  it("omits sports that are not implemented", async () => {
    apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "badminton", name: "Badminton" },
        { id: "disc_golf", name: "Disc Golf" },
      ],
    } as unknown as Response);

    render(await RecordPage());

    expect(screen.getByRole("link", { name: "Disc Golf" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Badminton" }),
    ).not.toBeInTheDocument();
  });

  it("falls back to known sports when the API omits them", async () => {
    apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "padel", name: "Padel" },
        { id: "bowling", name: "Bowling" },
      ],
    } as unknown as Response);

    render(await RecordPage());

    expect(
      screen.getByRole("link", { name: "Table Tennis" }),
    ).toHaveAttribute("href", "/record/table-tennis");
    expect(
      screen.getByRole("link", { name: "Padel" }),
    ).toHaveAttribute("href", "/record/padel");
    expect(
      screen.getByRole("link", { name: "Bowling" }),
    ).toHaveAttribute("href", "/record/bowling");
  });
});
