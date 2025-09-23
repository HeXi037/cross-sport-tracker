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
  fetchClubs: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
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
    apiMocks.fetchClubs.mockReset();
    apiMocks.fetchClubs.mockResolvedValue([]);
    apiMocks.isLoggedIn.mockReturnValue(true);
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
      bio: "Existing bio",
    });

    await act(async () => {
      render(<ProfilePage />);
    });

    expect(await screen.findByDisplayValue("existing")).toBeInTheDocument();
    const countrySelect = screen.getByLabelText("Country") as HTMLSelectElement;
    expect(countrySelect.value).toBe("US");
    expect(screen.getByText(/Continent:/i)).toHaveTextContent("North America");
    const [, clubSelect] = screen.getAllByLabelText("Favorite club") as [
      HTMLInputElement,
      HTMLSelectElement,
    ];
    expect(clubSelect.value).toBe("club-old");
    expect(
      screen.getByLabelText("Biography") as HTMLTextAreaElement
    ).toHaveValue("Existing bio");
  });

  it("submits updated country and biography when saving", async () => {
    apiMocks.fetchMe.mockResolvedValue({ username: "existing" });
    apiMocks.fetchMyPlayer.mockResolvedValue({
      id: "player-1",
      name: "Existing Player",
      location: "US",
      country_code: "US",
      region_code: "NA",
      club_id: "club-old",
      bio: "Existing bio",
    });
    apiMocks.updateMyPlayerLocation.mockResolvedValue({
      id: "player-1",
      name: "Existing Player",
      location: "US",
      country_code: "SE",
      region_code: "EU",
      club_id: "club-new",
      bio: "Updated biography",
    });
    apiMocks.updateMe.mockResolvedValue({ access_token: "new.token.value" });

    await act(async () => {
      render(<ProfilePage />);
    });

    const countrySelect = screen.getByLabelText("Country") as HTMLSelectElement;
    screen.getAllByLabelText("Favorite club");
    const bioTextarea = screen.getByLabelText("Biography") as HTMLTextAreaElement;

    fireEvent.change(countrySelect, { target: { value: "SE" } });
    fireEvent.change(bioTextarea, { target: { value: "Updated biography" } });

    const saveButton = screen.getByRole("button", { name: /save/i });

    await act(async () => {
      fireEvent.click(saveButton);
    });

    const statusMessage = await screen.findByRole("status");

    expect(apiMocks.updateMyPlayerLocation).toHaveBeenCalledWith(
      expect.objectContaining({
        location: "SE",
        country_code: "SE",
        region_code: "EU",
        bio: "Updated biography",
      })
    );
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
      bio: "Existing bio",
    });
    apiMocks.updateMyPlayerLocation.mockResolvedValue({
      id: "player-1",
      name: "Existing Player",
      location: null,
      country_code: null,
      region_code: null,
      club_id: null,
      bio: null,
    });
    apiMocks.updateMe.mockResolvedValue({});

    await act(async () => {
      render(<ProfilePage />);
    });

    await screen.findByDisplayValue("existing");

    const countrySelect = screen.getByLabelText("Country") as HTMLSelectElement;
    const [, clubSelect] = screen.getAllByLabelText("Favorite club") as [
      HTMLInputElement,
      HTMLSelectElement,
    ];
    const bioTextarea = screen.getByLabelText("Biography") as HTMLTextAreaElement;

    fireEvent.change(countrySelect, { target: { value: "" } });
    fireEvent.change(clubSelect, { target: { value: "" } });
    fireEvent.change(bioTextarea, { target: { value: "   " } });

    const saveButton = screen.getByRole("button", { name: /save/i });

    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(apiMocks.updateMyPlayerLocation).toHaveBeenCalledWith({
      location: null,
      country_code: null,
      region_code: null,
      club_id: null,
      bio: null,
    });
  });
});
