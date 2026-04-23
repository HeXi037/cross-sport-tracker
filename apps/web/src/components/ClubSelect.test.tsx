import "@testing-library/jest-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ClubSelect from "./filters/ClubSelect";
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

    const suggestionList = await screen.findByRole("listbox", {
      name: "Club suggestions",
    });
    const matchingOption = within(suggestionList).getByRole("option", {
      name: "Test Club",
    });
    expect(matchingOption).toBeInTheDocument();
    expect(within(suggestionList).queryByRole("option", { name: "Nordic Padel" })).not.toBeInTheDocument();
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

    const suggestionList = await screen.findByRole("listbox", {
      name: "Club suggestions",
    });
    const matchingOption = within(suggestionList).getByRole("option", {
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
    expect(within(suggestionList).getByRole("option", { name: "Nordic Padel" })).toBeVisible();
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

    const suggestionList = await screen.findByRole("listbox", {
      name: "Club suggestions",
    });
    const suggestionOption = within(suggestionList).getByRole("option", {
      name: "Nordic Padel",
    });
    await user.click(suggestionOption);

    expect(handleChange).toHaveBeenCalledWith("club-5");
  });

  it("supports ArrowDown/ArrowUp/Enter/Escape for suggestions", async () => {
    fetchClubsMock.mockResolvedValue([
      { id: "club-1", name: "Nordic Padel" },
      { id: "club-2", name: "Padel Club" },
      { id: "club-3", name: "Court Kings" },
    ]);
    const handleChange = vi.fn();

    render(<ClubSelect value="" onChange={handleChange} />);

    await waitFor(() => expect(fetchClubsMock).toHaveBeenCalled());

    const user = userEvent.setup();
    const searchInput = screen.getByRole("combobox", { name: "Search clubs" });
    await user.type(searchInput, "padel");

    const listbox = await screen.findByRole("listbox", { name: "Club suggestions" });
    expect(listbox).toBeVisible();
    expect(searchInput).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{ArrowDown}");
    expect(within(listbox).getByRole("option", { name: "Nordic Padel" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.keyboard("{ArrowDown}");
    expect(within(listbox).getByRole("option", { name: "Padel Club" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.keyboard("{ArrowUp}");
    expect(within(listbox).getByRole("option", { name: "Nordic Padel" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.keyboard("{Enter}");
    expect(handleChange).toHaveBeenCalledWith("club-1");

    await user.type(searchInput, "padel");
    await screen.findByRole("listbox", { name: "Club suggestions" });
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox", { name: "Club suggestions" })).not.toBeInTheDocument();
    expect(searchInput).toHaveValue("");
  });

  it("uses provided options without fetching fallback data", async () => {
    const handleChange = vi.fn();
    render(
      <ClubSelect
        value=""
        onChange={handleChange}
        options={[
          { id: "club-1", name: "Provided Club" },
          { id: "club-2", name: "Fallback Free" },
        ]}
      />
    );

    expect(fetchClubsMock).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Select club" }),
      "club-1"
    );

    expect(handleChange).toHaveBeenCalledWith("club-1");
  });
});
