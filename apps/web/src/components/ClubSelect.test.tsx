import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ClubSelect from "./ClubSelect";
import { fetchClubs } from "../lib/api";

vi.mock("../lib/api", () => ({
  fetchClubs: vi.fn(),
}));

const fetchClubsMock = vi.mocked(fetchClubs);

describe("ClubSelect", () => {
  beforeEach(() => {
    fetchClubsMock.mockReset();
  });

  it("suggests clubs even when whitespace and punctuation differ", async () => {
    fetchClubsMock.mockResolvedValue([
      { id: "club-1", name: "Test Club" },
      { id: "club-2", name: "Nordic Padel" },
    ]);

    render(<ClubSelect value="" onChange={() => {}} />);

    await waitFor(() => expect(fetchClubsMock).toHaveBeenCalled());

    const user = userEvent.setup();
    const searchInput = screen.getByLabelText("Search clubs");
    await user.clear(searchInput);
    await user.type(searchInput, "Testclub");

    const matchingOption = await screen.findByRole("option", {
      name: "Test Club",
    });
    expect(matchingOption).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Nordic Padel" })
    ).not.toBeInTheDocument();
  });

  it("matches accents when searching for clubs", async () => {
    fetchClubsMock.mockResolvedValue([
      { id: "club-3", name: "São Paulo Padel" },
    ]);

    render(<ClubSelect value="" onChange={() => {}} />);

    await waitFor(() => expect(fetchClubsMock).toHaveBeenCalled());

    const user = userEvent.setup();
    const searchInput = screen.getByLabelText("Search clubs");
    await user.clear(searchInput);
    await user.type(searchInput, "Sao Paulo");

    const matchingOption = await screen.findByRole("option", {
      name: "São Paulo Padel",
    });
    expect(matchingOption).toBeInTheDocument();
  });

  it("shows inline suggestions as the user types", async () => {
    fetchClubsMock.mockResolvedValue([
      { id: "club-1", name: "Nordic Padel" },
      { id: "club-2", name: "Padel Club" },
    ]);

    render(<ClubSelect value="" onChange={() => {}} />);

    await waitFor(() => expect(fetchClubsMock).toHaveBeenCalled());

    const user = userEvent.setup();
    const searchInput = screen.getByLabelText("Search clubs");
    await user.clear(searchInput);
    await user.type(searchInput, "nord");

    const suggestionList = await screen.findByRole("listbox", {
      name: "Club suggestions",
    });
    expect(suggestionList).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Select Nordic Padel" })
    ).toBeVisible();
  });

  it("selects a club when a suggestion is chosen", async () => {
    fetchClubsMock.mockResolvedValue([
      { id: "club-5", name: "Nordic Padel" },
    ]);
    const handleChange = vi.fn();

    render(<ClubSelect value="" onChange={handleChange} />);

    await waitFor(() => expect(fetchClubsMock).toHaveBeenCalled());

    const user = userEvent.setup();
    const searchInput = screen.getByLabelText("Search clubs");
    await user.type(searchInput, "nord");

    const suggestionButton = await screen.findByRole("button", {
      name: "Select Nordic Padel",
    });
    await user.click(suggestionButton);

    expect(handleChange).toHaveBeenCalledWith("club-5");
  });
});
