import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import * as LocaleContext from "../../lib/LocaleContext";
import ToastProvider from "../../components/ToastProvider";
import * as i18n from "../../lib/i18n";

function renderWithProviders(ui: JSX.Element) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

const pushMock = vi.hoisted(() => vi.fn());
const apiMocks = vi.hoisted(() => ({
  fetchMe: vi.fn(),
  updateMe: vi.fn(),
  isLoggedIn: vi.fn(),
  apiFetch: vi.fn(),
  fetchMyPlayer: vi.fn(),
  fetchClubs: vi.fn(),
  createMyPlayer: vi.fn(),
  updateMyPlayerLocation: vi.fn(),
  createMySocialLink: vi.fn(),
  updateMySocialLink: vi.fn(),
  deleteMySocialLink: vi.fn(),
  fetchNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
  registerPushSubscription: vi.fn(),
  deletePushSubscriptions: vi.fn(),
}));

const routerMock = vi.hoisted(() => ({ push: pushMock }));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>(
    "../../lib/api"
  );
  return {
    ...actual,
    fetchMe: apiMocks.fetchMe,
    updateMe: apiMocks.updateMe,
    isLoggedIn: apiMocks.isLoggedIn,
    apiFetch: apiMocks.apiFetch,
    fetchMyPlayer: apiMocks.fetchMyPlayer,
    fetchClubs: apiMocks.fetchClubs,
    createMyPlayer: apiMocks.createMyPlayer,
    updateMyPlayerLocation: apiMocks.updateMyPlayerLocation,
    createMySocialLink: apiMocks.createMySocialLink,
    updateMySocialLink: apiMocks.updateMySocialLink,
    deleteMySocialLink: apiMocks.deleteMySocialLink,
    fetchNotificationPreferences: apiMocks.fetchNotificationPreferences,
    updateNotificationPreferences: apiMocks.updateNotificationPreferences,
    registerPushSubscription: apiMocks.registerPushSubscription,
    deletePushSubscriptions: apiMocks.deletePushSubscriptions,
  };
});

import ProfilePage from "./page";
import { USER_SETTINGS_STORAGE_KEY } from "../user-settings";

describe("ProfilePage", () => {
  beforeEach(() => {
    pushMock.mockReset();
    apiMocks.fetchMe.mockReset();
    apiMocks.updateMe.mockReset();
    apiMocks.isLoggedIn.mockReset();
    apiMocks.apiFetch.mockReset();
    apiMocks.fetchMyPlayer.mockReset();
    apiMocks.createMyPlayer.mockReset();
    apiMocks.fetchClubs.mockReset();
    apiMocks.updateMyPlayerLocation.mockReset();
    apiMocks.createMySocialLink.mockReset();
    apiMocks.updateMySocialLink.mockReset();
    apiMocks.deleteMySocialLink.mockReset();
    apiMocks.fetchNotificationPreferences.mockReset();
    apiMocks.updateNotificationPreferences.mockReset();
    apiMocks.registerPushSubscription.mockReset();
    apiMocks.deletePushSubscriptions.mockReset();
    apiMocks.isLoggedIn.mockReturnValue(true);
    apiMocks.fetchMe.mockResolvedValue({
      id: "user-default",
      username: "default-user",
      is_admin: false,
      photo_url: null,
    });
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
    apiMocks.fetchClubs.mockResolvedValue([
      { id: "club-old", name: "Club Old" },
      { id: "club-new", name: "Club New" },
    ]);
    apiMocks.fetchNotificationPreferences.mockResolvedValue({
      notifyOnProfileComments: false,
      notifyOnMatchResults: false,
      pushEnabled: false,
      subscriptions: [],
    });
    apiMocks.updateNotificationPreferences.mockResolvedValue({
      notifyOnProfileComments: false,
      notifyOnMatchResults: false,
      pushEnabled: false,
      subscriptions: [],
    });
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("loads and displays existing player details", async () => {
    apiMocks.fetchMe.mockResolvedValue({
      id: "user-existing",
      username: "existing",
      is_admin: false,
      photo_url: "photo.png",
    });
    apiMocks.fetchMyPlayer.mockResolvedValue({
      id: "player-1",
      name: "Existing Player",
      location: "US",
      country_code: "US",
      region_code: "NA",
      club_id: "club-old",
    });

    await act(async () => {
      renderWithProviders(<ProfilePage />);
    });

    expect(await screen.findByDisplayValue("existing")).toBeInTheDocument();
    const countrySelect = (await screen.findByLabelText("Country")) as HTMLSelectElement;
    expect(countrySelect.value).toBe("US");
    const continentDisplay = await screen.findByTestId("continent-display");
    expect(continentDisplay).toHaveTextContent("North America");
    const favoriteClubFields = await screen.findAllByLabelText("Favorite club");
    const clubSearchInput = favoriteClubFields[0] as HTMLInputElement;
    expect(clubSearchInput).toHaveValue("Club Old");
  });

  it("normalizes relative profile photo URLs", async () => {
    apiMocks.fetchMe.mockResolvedValue({
      id: "user-relative",
      username: "relative-user",
      is_admin: false,
      photo_url: "/media/photos/me.png",
    });

    await act(async () => {
      renderWithProviders(<ProfilePage />);
    });

    const img = await screen.findByAltText("relative-user profile photo");
    expect(img).toHaveAttribute("src", "/api/media/photos/me.png");
  });

  it("uploads a new profile photo and refreshes the preview", async () => {
    const file = new File(["dummy"], "avatar.png", { type: "image/png" });
    apiMocks.apiFetch.mockResolvedValue({
      json: async () => ({
        id: "user-default",
        username: "default-user",
        is_admin: false,
        photo_url: "/static/users/avatar.png",
      }),
    } as unknown as Response);
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(123456789);

    await act(async () => {
      renderWithProviders(<ProfilePage />);
    });

    const fileInput = await screen.findByLabelText("Profile photo");

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(apiMocks.apiFetch).toHaveBeenCalledWith("/v0/auth/me/photo", {
      method: "POST",
      body: expect.any(FormData),
    });

    const preview = await screen.findByAltText("default-user profile photo");
    expect(preview).toHaveAttribute(
      "src",
      "/api/static/users/avatar.png?t=123456789",
    );
    expect(screen.queryByText("Updating photo…")).not.toBeInTheDocument();
    dateSpy.mockRestore();
  });

  it("removes the profile photo", async () => {
    apiMocks.fetchMe.mockResolvedValue({
      id: "user-with-photo",
      username: "has-photo",
      is_admin: false,
      photo_url: "/static/users/avatar.png",
    });
    apiMocks.apiFetch.mockResolvedValueOnce({
      json: async () => ({
        id: "user-with-photo",
        username: "has-photo",
        is_admin: false,
        photo_url: null,
      }),
    } as unknown as Response);

    await act(async () => {
      renderWithProviders(<ProfilePage />);
    });

    const removeButton = await screen.findByRole("button", {
      name: "Remove photo",
    });

    await act(async () => {
      fireEvent.click(removeButton);
    });

    expect(apiMocks.apiFetch).toHaveBeenCalledWith("/v0/auth/me/photo", {
      method: "DELETE",
    });
    expect(screen.queryByAltText("has-photo profile photo")).not.toBeInTheDocument();
    expect(
      await screen.findByText("Profile photo removed")
    ).toBeInTheDocument();
  });

  it("updates notification preferences when toggles change", async () => {
    await act(async () => {
      renderWithProviders(<ProfilePage />);
    });

    await waitFor(() => {
      expect(apiMocks.fetchNotificationPreferences).toHaveBeenCalled();
    });

    const toggle = await screen.findByLabelText(/profile comments/i);
    apiMocks.updateNotificationPreferences.mockResolvedValueOnce({
      notifyOnProfileComments: true,
      notifyOnMatchResults: false,
      pushEnabled: false,
      subscriptions: [],
    });

    await act(async () => {
      fireEvent.click(toggle);
    });

    expect(apiMocks.updateNotificationPreferences).toHaveBeenCalledWith({
      notifyOnProfileComments: true,
    });
  });

  it("describes how notifications are delivered", async () => {
    await act(async () => {
      renderWithProviders(<ProfilePage />);
    });

    expect(
      await screen.findByText(/Notifications appear in the bell icon/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Send bell, email, and push notifications when someone comments/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Send bell, email, and push notifications when a match involving you is recorded/i),
    ).toBeInTheDocument();
  });

  it("submits updated country and favorite club when saving", async () => {
    apiMocks.fetchMe.mockResolvedValue({
      id: "user-existing",
      username: "existing",
      is_admin: false,
    });
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
      renderWithProviders(<ProfilePage />);
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

    const saveButton = await screen.findByRole("button", { name: /^save$/i });

    await act(async () => {
      fireEvent.click(saveButton);
    });

    const statusMessage = await screen.findByText(/Profile saved successfully\./i, {
      selector: "p",
    });
    const toast = await screen.findByTestId("toast");

    expect(apiMocks.updateMyPlayerLocation).toHaveBeenCalledWith({
      location: "SE",
      country_code: "SE",
      region_code: "EU",
      club_id: "club-new",
    });
    expect(apiMocks.updateMe).toHaveBeenCalledWith({ username: "existing" });
    expect(statusMessage).toBeInTheDocument();
    expect(toast).toHaveTextContent(/Profile saved successfully\./i);
    expect(window.localStorage.getItem("token")).toBe("new.token.value");
  });

  it("allows clearing country and club", async () => {
    apiMocks.fetchMe.mockResolvedValue({
      id: "user-existing",
      username: "existing",
      is_admin: false,
    });
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
      renderWithProviders(<ProfilePage />);
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

    const saveButton = await screen.findByRole("button", { name: /^save$/i });

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

  it("hides player fields and shows a create button when no player exists", async () => {
    const notFound = Object.assign(new Error("HTTP 404: player not found"), {
      status: 404,
    });
    apiMocks.fetchMyPlayer.mockRejectedValueOnce(notFound);

    await act(async () => {
      renderWithProviders(<ProfilePage />);
    });

    const createButtons = await screen.findAllByRole("button", {
      name: /create my player profile/i,
    });
    expect(createButtons.length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Country")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("New social link label", { selector: "input" })
    ).not.toBeInTheDocument();
  });

  it("hides player customization when access is denied", async () => {
    const forbidden = Object.assign(new Error("HTTP 403: forbidden"), {
      status: 403,
    });
    apiMocks.fetchMyPlayer.mockRejectedValueOnce(forbidden);

    await act(async () => {
      renderWithProviders(<ProfilePage />);
    });

    const restrictionMessage = await screen.findByText(
      /player profile is managed by an administrator/i,
    );
    expect(restrictionMessage).toBeInTheDocument();
    expect(screen.queryByLabelText("Country")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /create my player profile/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/social links are managed by an administrator/i)
    ).toBeInTheDocument();
  });

  it("creates a player record on demand", async () => {
    const notFound = Object.assign(new Error("HTTP 404: player not found"), {
      status: 404,
    });
    apiMocks.fetchMyPlayer.mockRejectedValueOnce(notFound);
    apiMocks.createMyPlayer.mockResolvedValue({
      id: "player-created",
      name: "Created Player",
      location: null,
      country_code: "SE",
      region_code: "EU",
      club_id: null,
      bio: "",
      social_links: [],
    });

    await act(async () => {
      renderWithProviders(<ProfilePage />);
    });

    const createButtons = await screen.findAllByRole("button", {
      name: /create my player profile/i,
    });

    await act(async () => {
      fireEvent.click(createButtons[0]);
    });

    expect(apiMocks.createMyPlayer).toHaveBeenCalledTimes(1);
    const success = await screen.findByText(/Player profile created/i);
    expect(success).toBeInTheDocument();
    const countrySelect = await screen.findByLabelText("Country");
    expect((countrySelect as HTMLSelectElement).value).toBe("SE");
  });

  it("requires matching confirm password when updating the password", async () => {
    apiMocks.updateMe.mockResolvedValue({});

    await act(async () => {
      renderWithProviders(<ProfilePage />);
    });

    const passwordInput = await screen.findByLabelText("New password");
    const confirmInput = await screen.findByLabelText("Confirm new password");

    fireEvent.change(passwordInput, {
      target: { value: "StrongPass12!" },
    });
    fireEvent.change(confirmInput, {
      target: { value: "Mismatch12!" },
    });

    const saveButton = await screen.findByRole("button", { name: /^save$/i });

    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(apiMocks.updateMe).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Passwords do not match\./i)
    ).toBeInTheDocument();
  });

  it("saves account details even when no player record exists", async () => {
    const notFound = Object.assign(new Error("HTTP 404: player not found"), {
      status: 404,
    });
    apiMocks.fetchMyPlayer.mockRejectedValueOnce(notFound);
    apiMocks.updateMe.mockResolvedValue({});

    await act(async () => {
      renderWithProviders(<ProfilePage />);
    });

    const displayNameInput = await screen.findByLabelText("Display name");
    fireEvent.change(displayNameInput, { target: { value: "  new-name  " } });

    const saveButton = await screen.findByRole("button", { name: /^save$/i });

    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(apiMocks.updateMyPlayerLocation).not.toHaveBeenCalled();
    expect(apiMocks.updateMe).toHaveBeenCalledWith({ username: "new-name" });
  });

  it("loads stored user settings and saves updates", async () => {
    window.localStorage.setItem(
      USER_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        defaultLeaderboardSport: "padel",
        defaultLeaderboardCountry: "SE",
        weeklySummaryEmails: false,
        preferredLocale: "sv-SE",
      }),
    );

    await act(async () => {
      renderWithProviders(<ProfilePage />);
    });

    const sportSelect = (await screen.findByLabelText(
      "Default leaderboard sport",
    )) as HTMLSelectElement;
    expect(sportSelect.value).toBe("padel");

    const countrySelect = (await screen.findByLabelText(
      "Default leaderboard country",
    )) as HTMLSelectElement;
    expect(countrySelect.value).toBe("SE");

    const weeklyToggle = (await screen.findByLabelText(
      /Weekly summary emails/i,
    )) as HTMLInputElement;
    expect(weeklyToggle.checked).toBe(false);

    const localeInput = (await screen.findByLabelText(
      "Preferred locale",
    )) as HTMLInputElement;
    expect(localeInput.value).toBe("sv-SE");

    fireEvent.change(sportSelect, { target: { value: "disc_golf" } });
    fireEvent.change(countrySelect, { target: { value: "" } });
    fireEvent.click(weeklyToggle);
    fireEvent.change(localeInput, { target: { value: "fr-FR" } });

    const savePreferencesButton = await screen.findByRole("button", {
      name: /save preferences/i,
    });
    expect(savePreferencesButton).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(savePreferencesButton);
    });

    const stored = window.localStorage.getItem(USER_SETTINGS_STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string) as {
      defaultLeaderboardSport: string;
      defaultLeaderboardCountry: string;
      weeklySummaryEmails: boolean;
      preferredLocale: string;
    };
    expect(parsed.defaultLeaderboardSport).toBe("disc_golf");
    expect(parsed.defaultLeaderboardCountry).toBe("");
    expect(parsed.weeklySummaryEmails).toBe(true);
    expect(parsed.preferredLocale).toBe("fr-FR");

    await screen.findByText("Preferences updated.");
  });

  it("pre-populates the preferred locale input when settings are empty", async () => {
    const localeSpy = vi
      .spyOn(LocaleContext, "useLocale")
      .mockReturnValue("en-AU");

    try {
      await act(async () => {
        renderWithProviders(<ProfilePage />);
      });

      const localeInput = (await screen.findByLabelText(
        "Preferred locale",
      )) as HTMLInputElement;
      expect(localeInput.value).toBe("en-AU");
    } finally {
      localeSpy.mockRestore();
    }
  });

  it("seeds the preferred time zone from the current context when settings are empty", async () => {
    const localeSpy = vi.spyOn(LocaleContext, "useLocale").mockReturnValue("en-GB");
    const timeZoneSpy = vi
      .spyOn(LocaleContext, "useTimeZone")
      .mockReturnValue("Australia/Sydney");

    try {
      await act(async () => {
        renderWithProviders(<ProfilePage />);
      });

      const timeZoneInput = (await screen.findByLabelText(
        "Preferred time zone",
      )) as HTMLInputElement;

      await waitFor(() => {
        expect(timeZoneInput.value).toBe("Australia/Sydney");
      });
      expect(window.localStorage.getItem(i18n.TIME_ZONE_STORAGE_KEY)).toBe(
        "Australia/Sydney",
      );
    } finally {
      localeSpy.mockRestore();
      timeZoneSpy.mockRestore();
    }
  });

  it("detects a preferred time zone when the context does not provide one", async () => {
    const localeSpy = vi.spyOn(LocaleContext, "useLocale").mockReturnValue("en-US");
    const timeZoneSpy = vi.spyOn(LocaleContext, "useTimeZone").mockReturnValue("");
    const detectSpy = vi
      .spyOn(i18n, "detectTimeZone")
      .mockReturnValue("America/Los_Angeles");

    try {
      await act(async () => {
        renderWithProviders(<ProfilePage />);
      });

      const timeZoneInput = (await screen.findByLabelText(
        "Preferred time zone",
      )) as HTMLInputElement;

      await waitFor(() => {
        expect(timeZoneInput.value).toBe("America/Los_Angeles");
      });
      expect(detectSpy).toHaveBeenCalled();
      expect(window.localStorage.getItem(i18n.TIME_ZONE_STORAGE_KEY)).toBe(
        "America/Los_Angeles",
      );
    } finally {
      localeSpy.mockRestore();
      timeZoneSpy.mockRestore();
      detectSpy.mockRestore();
    }
  });

  it("keeps the profile save success message visible after rerenders", async () => {
    apiMocks.updateMe.mockResolvedValue({});

    const view = render(
      <ToastProvider>
        <ProfilePage />
      </ToastProvider>,
    );

    const saveButton = await screen.findByRole("button", { name: /^save$/i });

    await act(async () => {
      fireEvent.click(saveButton);
    });

    const statusMessage = await screen.findByText(/Profile saved successfully\./i, {
      selector: "p",
    });
    expect(statusMessage).toBeInTheDocument();

    await act(async () => {
      view.rerender(
        <ToastProvider>
          <ProfilePage />
        </ToastProvider>,
      );
    });

    expect(
      await screen.findByText(/Profile saved successfully\./i, {
        selector: "p",
      }),
    ).toBeInTheDocument();
  });

  it("displays the club loading status while options are fetched", async () => {
    let resolveClubs: ((value: Array<{ id: string; name: string }>) => void) | null =
      null;
    apiMocks.fetchClubs.mockImplementation(() =>
      new Promise((resolve) => {
        resolveClubs = resolve;
      }),
    );

    await act(async () => {
      renderWithProviders(<ProfilePage />);
    });

    const favoriteClubSelect = await screen.findByLabelText("Favorite club", {
      selector: "select",
    });
    expect(favoriteClubSelect).toBeInTheDocument();
    const loadingOption = await screen.findByRole("option", {
      name: "Loading clubs…",
    });
    expect(loadingOption).toBeInTheDocument();

    await act(async () => {
      resolveClubs?.([
        { id: "club-a", name: "Club A" },
        { id: "club-b", name: "Club B" },
      ]);
    });

    await waitFor(() => {
      expect(apiMocks.fetchClubs).toHaveBeenCalledTimes(1);
    });
  });
});
