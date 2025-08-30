import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import RecordSportPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ sport: "padel" }),
}));

describe("RecordSportPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects duplicate player selections", async () => {
    const players = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
      { id: "3", name: "Cara" },
      { id: "4", name: "Dan" },
    ];

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players }) });
    // @ts-expect-error override global fetch for test
    global.fetch = fetchMock;

    const alertMock = vi.spyOn(window, "alert").mockImplementation(() => {});

    render(<RecordSportPage />);

    await screen.findAllByText("Alice");

    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "1" } });
    fireEvent.change(selects[1], { target: { value: "1" } });
    fireEvent.change(selects[2], { target: { value: "2" } });
    fireEvent.change(selects[3], { target: { value: "3" } });

    fireEvent.change(screen.getByPlaceholderText("A"), {
      target: { value: "6" },
    });
    fireEvent.change(screen.getByPlaceholderText("B"), {
      target: { value: "4" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(alertMock).toHaveBeenCalledWith("Please select unique players.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

