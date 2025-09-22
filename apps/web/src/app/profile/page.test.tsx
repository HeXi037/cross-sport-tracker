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
    apiMocks.isLoggedIn.mockReturnValue(true);
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("loads and displays existing player location data", async () => {
    apiMocks.fetchMe.mockResolvedValue({ username: "existing", photo_url: "photo.png" });
    apiMocks.fetchMyPlayer.mockResolvedValue({
      id: "player-1",
      name: "Existing Player",
      location: "US-CA",
      country_code: "US",
      region_code: "CA",
    });

    await act(async () => {
      render(<ProfilePage />);
    });

    expect(await screen.findByDisplayValue("existing")).toBeInTheDocument();
    expect(screen.getByDisplayValue("US-CA")).toBeInTheDocument();
    expect(screen.getByDisplayValue("US")).toBeInTheDocument();
    expect(screen.getByDisplayValue("CA")).toBeInTheDocument();
  });

  it("validates country and region codes before submitting", async () => {
    apiMocks.fetchMe.mockResolvedValue({ username: "existing" });
    apiMocks.fetchMyPlayer.mockResolvedValue({
      id: "player-1",
      name: "Existing Player",
      location: null,
      country_code: null,
      region_code: null,
    });

    await act(async () => {
      render(<ProfilePage />);
    });

    await screen.findByDisplayValue("existing");

    const countryInput = screen.getByLabelText("Country code") as HTMLInputElement;
    fireEvent.change(countryInput, { target: { value: "USA" } });

    const saveButton = screen.getByRole("button", { name: /save/i });

    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Country code must be exactly 2 letters",
    );
    expect(apiMocks.updateMyPlayerLocation).not.toHaveBeenCalled();
    expect(apiMocks.updateMe).not.toHaveBeenCalled();
  });

  it("submits structured location data when saving", async () => {
    apiMocks.fetchMe.mockResolvedValue({ username: "existing" });
    apiMocks.fetchMyPlayer.mockResolvedValue({
      id: "player-1",
      name: "Existing Player",
      location: "US-CA",
      country_code: "US",
      region_code: "CA",
    });
    apiMocks.updateMyPlayerLocation.mockResolvedValue({
      id: "player-1",
      name: "Existing Player",
      location: "US",
      country_code: "US",
      region_code: null,
    });
    apiMocks.updateMe.mockResolvedValue({ access_token: "new.token.value" });

    await act(async () => {
      render(<ProfilePage />);
    });

    await screen.findByDisplayValue("US-CA");

    const locationInput = screen.getByLabelText("Location") as HTMLInputElement;
    const countryInput = screen.getByLabelText("Country code") as HTMLInputElement;
    const regionInput = screen.getByLabelText("Region code") as HTMLInputElement;

    fireEvent.change(locationInput, { target: { value: " Austin " } });
    fireEvent.change(countryInput, { target: { value: " us " } });
    fireEvent.change(regionInput, { target: { value: "   " } });

    expect(countryInput.value).toBe("US");
    expect(regionInput.value).toBe("");

    const saveButton = screen.getByRole("button", { name: /save/i });

    await act(async () => {
      fireEvent.click(saveButton);
    });

    const statusMessage = await screen.findByRole("status");

    expect(apiMocks.updateMyPlayerLocation).toHaveBeenCalledWith({
      location: "Austin",
      country_code: "US",
      region_code: null,
    });
    expect(apiMocks.updateMe).toHaveBeenCalledWith({ username: "existing" });
    expect(statusMessage).toHaveTextContent(/profile updated/i);
    expect(window.localStorage.getItem("token")).toBe("new.token.value");
  });
});
