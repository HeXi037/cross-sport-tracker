import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

const pushMock = vi.hoisted(() => vi.fn());
const apiMocks = vi.hoisted(() => ({
  fetchMe: vi.fn(),
  updateMe: vi.fn(),
  isLoggedIn: vi.fn(),
  apiFetch: vi.fn(),
  fetchMyPlayer: vi.fn(),
  updateMyPlayerLocation: vi.fn(),
}));

const routerMock = vi.hoisted(() => ({ push: pushMock }));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

vi.mock("../../lib/api", () => apiMocks);

import ProfilePage from "./page";

describe("ProfilePage", () => {
  beforeEach(() => {
    pushMock.mockReset();
    apiMocks.fetchMe.mockReset();
    apiMocks.updateMe.mockReset();
    apiMocks.isLoggedIn.mockReset();
    apiMocks.apiFetch.mockReset();
    apiMocks.fetchMyPlayer.mockReset();
    apiMocks.updateMyPlayerLocation.mockReset();
    apiMocks.isLoggedIn.mockReturnValue(true);
    apiMocks.fetchMe.mockResolvedValue({ username: "default-user", photo_url: null });
    apiMocks.fetchMyPlayer.mockResolvedValue({
      id: "default-player",
      name: "Default Player",
      location: null,
      country_code: null,
      region_code: null,
      club_id: null,
      bio: "",
      social_links: [],
    });
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("loads and displays existing player details", async () => {
    apiMocks.fetchMe.mockResolvedValue({ username: "existing", photo_url: "photo.png" });
    apiMocks.fetchMyPlayer.mockResolvedValue({
      id: "player-1",
      name: "Existing Player",
      location: "US",
      country_code: "US",
      region_code: "NA",
      club_id: "club-old",
    });

    await act(async () => {
      render(<ProfilePage />);
    });

    expect(await screen.findByDisplayValue("existing")).toBeInTheDocument();
    const countrySelect = (await screen.findByLabelText("Country")) as HTMLSelectElement;
    expect(countrySelect.value).toBe("US");
    expect(await screen.findByText(/Continent:/i)).toHaveTextContent("North America");
    const favoriteClubFields = await screen.findAllByLabelText("Favorite club");
    const clubSearchInput = favoriteClubFields[0] as HTMLInputElement;
    expect(clubSearchInput).toHaveValue("club-old");
  });

  it("submits updated country and favorite club when saving", async () => {
    apiMocks.fetchMe.mockResolvedValue({ username: "existing" });
    apiMocks.fetchMyPlayer.mockResolvedValue({
      id: "player-1",
      name: "Existing Player",
      location: "US",
      country_code: "US",
      region_code: "NA",
      club_id: "club-old",
    });
    apiMocks.updateMyPlayerLocation.mockResolvedValue({
      id: "player-1",
      name: "Existing Player",
      location: "US",
      country_code: "SE",
      region_code: "EU",
      club_id: "club-new",
    });
    apiMocks.updateMe.mockResolvedValue({ access_token: "new.token.value" });

    await act(async () => {
      render(<ProfilePage />);
    });

    await screen.findByDisplayValue("existing");

    const countrySelect = (await screen.findByLabelText("Country")) as HTMLSelectElement;
    const favoriteClubFields = await screen.findAllByLabelText("Favorite club");
    const clubSearchInput = favoriteClubFields[0] as HTMLInputElement;
    const clubSelect = favoriteClubFields[1] as HTMLSelectElement;

    fireEvent.change(countrySelect, { target: { value: "SE" } });
    fireEvent.change(clubSearchInput, { target: { value: " club-new " } });
    const newClubOption = document.createElement("option");
    newClubOption.value = "club-new";
    newClubOption.textContent = "club-new";
    clubSelect.appendChild(newClubOption);
    fireEvent.change(clubSelect, { target: { value: "club-new" } });
    expect(clubSelect).toHaveValue("club-new");

    const saveButton = await screen.findByRole("button", { name: /save/i });

    await act(async () => {
      fireEvent.click(saveButton);
    });

    const statusMessage = await screen.findByRole("status");

    expect(apiMocks.updateMyPlayerLocation).toHaveBeenCalledWith({
      location: "SE",
      country_code: "SE",
      region_code: "EU",
      club_id: "club-new",
    });
    expect(apiMocks.updateMe).toHaveBeenCalledWith({ username: "existing" });
    expect(statusMessage).toHaveTextContent(/profile updated/i);
    expect(window.localStorage.getItem("token")).toBe("new.token.value");
  });

  it("allows clearing country and club", async () => {
    apiMocks.fetchMe.mockResolvedValue({ username: "existing" });
    apiMocks.fetchMyPlayer.mockResolvedValue({
      id: "player-1",
      name: "Existing Player",
      location: "US",
      country_code: "US",
      region_code: "NA",
      club_id: "club-old",
    });
    apiMocks.updateMyPlayerLocation.mockResolvedValue({
      id: "player-1",
      name: "Existing Player",
      location: null,
      country_code: null,
      region_code: null,
      club_id: null,
    });
    apiMocks.updateMe.mockResolvedValue({});

    await act(async () => {
      render(<ProfilePage />);
    });

    await screen.findByDisplayValue("existing");

    const countrySelect = (await screen.findByLabelText("Country")) as HTMLSelectElement;
    const favoriteClubFields = await screen.findAllByLabelText("Favorite club");
    const clubSearchInput = favoriteClubFields[0] as HTMLInputElement;
    const clubSelect = favoriteClubFields[1] as HTMLSelectElement;

    fireEvent.change(countrySelect, { target: { value: "" } });
    fireEvent.change(clubSearchInput, { target: { value: " " } });
    fireEvent.change(clubSelect, { target: { value: "" } });
    expect(clubSelect).toHaveValue("");

    const saveButton = await screen.findByRole("button", { name: /save/i });

    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(apiMocks.updateMyPlayerLocation).toHaveBeenCalledWith({
      location: null,
      country_code: null,
      region_code: null,
      club_id: null,
    });
  });
});
