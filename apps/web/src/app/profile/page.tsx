"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ChangeEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  fetchMe,
  updateMe,
  isLoggedIn,
  apiFetch,
  fetchMyPlayer,
  updateMyPlayerLocation,
  createMyPlayer,
  createMySocialLink,
  updateMySocialLink,
  deleteMySocialLink,
  type PlayerSocialLink,
  type PlayerMe,
  type UserMe,
  ensureAbsoluteApiUrl,
  persistSession,
} from "../../lib/api";
import type { PlayerLocationPayload } from "../../lib/api";
import ClubSelect from "../../components/ClubSelect";
import {
  COUNTRY_OPTIONS,
  getContinentForCountry,
  CONTINENT_LABELS,
} from "../../lib/countries";
import {
  areUserSettingsEqual,
  getDefaultUserSettings,
  loadUserSettings,
  saveUserSettings,
  type UserSettings,
} from "../user-settings";
import {
  ALL_SPORTS,
  MASTER_SPORT,
  SPORT_OPTIONS,
} from "../leaderboard/constants";

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
const INVALID_SOCIAL_URL_MESSAGE =
  "Enter a valid URL that starts with http:// or https:// and includes a hostname.";
const SOCIAL_LINK_LABEL_REQUIRED_MESSAGE = "Link label is required";

type SaveFeedback = { type: "success" | "error"; message: string } | null;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isValidHttpUrl(value: string): boolean {
  if (!value) {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (/\s/.test(trimmed)) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (!parsed.hostname) {
      return false;
    }
    if (LOCAL_HOSTS.has(parsed.hostname)) {
      return true;
    }
    return parsed.hostname.includes(".");
  } catch {
    return false;
  }
}

function extractErrorMessage(err: unknown): string | null {
  if (!err) return null;
  if (typeof err === "string") {
    const trimmed = err.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (err instanceof Error) {
    const trimmed = err.message.trim();
    if (!trimmed) return null;
    const match = /^HTTP \d+:\s*(.*)$/.exec(trimmed);
    const message = (match ? match[1] : trimmed).trim();
    return message.length > 0 ? message : null;
  }
  return null;
}

function formatSportOption(id: string): string {
  if (id === ALL_SPORTS) {
    return "All sports (combined)";
  }
  if (id === MASTER_SPORT) {
    return "Master leaderboard";
  }
  return id
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function ProfilePage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [countryCode, setCountryCode] = useState("");
  const [clubId, setClubId] = useState("");
  const [bio, setBio] = useState("");
  const [hasPlayer, setHasPlayer] = useState(true);
  const [initialCountryCode, setInitialCountryCode] = useState("");
  const [initialClubId, setInitialClubId] = useState("");
  const [initialBio, setInitialBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [socialLinks, setSocialLinks] = useState<PlayerSocialLink[]>([]);
  const [linkDrafts, setLinkDrafts] = useState<
    Record<string, { label: string; url: string }>
  >({});
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [linkSavingId, setLinkSavingId] = useState<string | null>(null);
  const [linkDeletingId, setLinkDeletingId] = useState<string | null>(null);
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback>(null);
  const [preferences, setPreferences] = useState<UserSettings>(
    () => getDefaultUserSettings(),
  );
  const [initialPreferences, setInitialPreferences] = useState<UserSettings>(
    () => getDefaultUserSettings(),
  );
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesFeedback, setPreferencesFeedback] =
    useState<SaveFeedback>(null);
  const [creatingPlayer, setCreatingPlayer] = useState(false);

  const clearFeedback = () => {
    setError(null);
    setMessage(null);
    setSaveFeedback(null);
    setPreferencesFeedback(null);
  };

  const resetSocialLinkState = useCallback((links: PlayerSocialLink[]) => {
    setSocialLinks(links);
    setLinkDrafts(
      Object.fromEntries(
        links.map((link) => [link.id, { label: link.label, url: link.url }])
      ) as Record<string, { label: string; url: string }>
    );
  }, []);

  const applyPlayerDetails = useCallback((player: PlayerMe | null) => {
    const nextCountry = player?.country_code ?? "";
    const nextClub = player?.club_id ?? "";
    const nextBio = player?.bio ?? "";
    const nextLinks = player?.social_links ?? [];
    setCountryCode(nextCountry);
    setClubId(nextClub);
    setBio(nextBio);
    setInitialCountryCode(nextCountry);
    setInitialClubId(nextClub);
    setInitialBio(nextBio);
    resetSocialLinkState(nextLinks);
  }, [resetSocialLinkState]);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    let active = true;
    (async () => {
      try {
        const me: UserMe = await fetchMe();
        if (!active) return;
        setUsername(me.username);
        setPhotoUrl(
          typeof me.photo_url === "string" && me.photo_url
            ? ensureAbsoluteApiUrl(me.photo_url)
            : null
        );
        try {
          const player = await fetchMyPlayer();
          if (!active) return;
          setHasPlayer(true);
          applyPlayerDetails(player);
        } catch (playerErr) {
          if (!active) return;
          const status = (playerErr as Error & { status?: number }).status;
          if (status === 401) {
            router.push("/login");
            return;
          }
          if (status === 404) {
            setHasPlayer(false);
            applyPlayerDetails(null);
          } else {
            console.error("Failed to load player profile", playerErr);
            setError("Failed to load profile");
            setMessage(null);
            setPreferencesFeedback(null);
          }
        }
      } catch {
        if (!active) return;
        router.push("/login");
        return;
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [applyPlayerDetails, router]);

  useEffect(() => {
    const stored = loadUserSettings();
    setPreferences(stored);
    setInitialPreferences(stored);
    setPreferencesLoaded(true);
  }, []);

  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    clearFeedback();
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch("/v0/auth/me/photo", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as { photo_url?: string };
      setPhotoUrl(
        typeof data.photo_url === "string" && data.photo_url
          ? ensureAbsoluteApiUrl(data.photo_url)
          : null
      );
      setMessage("Profile photo updated");
    } catch {
      setError("Photo upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearFeedback();
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
      setSaveFeedback({
        type: "error",
        message: "Username must be at least 3 characters.",
      });
      return;
    }
    if (password && (password.length < 12 || !PASSWORD_REGEX.test(password))) {
      setSaveFeedback({
        type: "error",
        message:
          "Password must be at least 12 characters and include letters, numbers, and symbols.",
      });
      return;
    }
    if (password && password !== confirmPassword) {
      setSaveFeedback({
        type: "error",
        message: "Passwords do not match.",
      });
      return;
    }

    const normalizedCountry = countryCode.trim().toUpperCase();
    const trimmedClubId = clubId.trim();
    const trimmedBio = bio.trim();
    const initialBioTrimmed = initialBio.trim();

    if (hasPlayer) {
      const hasValidCountry =
        !normalizedCountry ||
        COUNTRY_OPTIONS.some((option) => option.code === normalizedCountry);
      if (!hasValidCountry) {
        setSaveFeedback({
          type: "error",
          message: "Please select a valid country.",
        });
        return;
      }
    }

    setUsername(trimmedUsername);

    const payload: PlayerLocationPayload = {};

    if (hasPlayer) {
      setCountryCode(normalizedCountry);
      setClubId(trimmedClubId);
      setBio(trimmedBio);

      const countryChanged = normalizedCountry !== initialCountryCode;
      const clubChanged = trimmedClubId !== initialClubId;
      const bioChanged = trimmedBio !== initialBioTrimmed;

      if (countryChanged) {
        const continentCode = normalizedCountry
          ? getContinentForCountry(normalizedCountry)
          : undefined;
        payload.country_code = normalizedCountry ? normalizedCountry : null;
        payload.location = normalizedCountry ? normalizedCountry : null;
        payload.region_code = normalizedCountry
          ? continentCode ?? null
          : null;
      }

      if (clubChanged) {
        payload.club_id = trimmedClubId ? trimmedClubId : null;
      }

      if (bioChanged) {
        payload.bio = trimmedBio ? trimmedBio : null;
      }
    }

    setSaving(true);
    try {
      if (hasPlayer && Object.keys(payload).length > 0) {
        try {
          const updatedPlayer = await updateMyPlayerLocation(payload);
          const nextCountry = updatedPlayer.country_code ?? "";
          const nextClub = updatedPlayer.club_id ?? "";
          const nextBioValue = updatedPlayer.bio ?? "";
          setCountryCode(nextCountry);
          setClubId(nextClub);
          setBio(nextBioValue);
          setInitialCountryCode(nextCountry);
          setInitialClubId(nextClub);
          setInitialBio(nextBioValue);
          resetSocialLinkState(updatedPlayer.social_links ?? []);
        } catch (err) {
          const status = (err as Error & { status?: number }).status;
          if (status === 422) {
            setSaveFeedback({
              type: "error",
              message: "Invalid location. Please choose a different country or club.",
            });
          } else {
            const message = extractErrorMessage(err);
            setSaveFeedback({
              type: "error",
              message: message ?? "Failed to update location settings.",
            });
          }
          return;
        }
      } else if (hasPlayer) {
        setInitialCountryCode(normalizedCountry);
        setInitialClubId(trimmedClubId);
        setBio(trimmedBio);
        setInitialBio(trimmedBio);
      }

      const body: { username: string; password?: string } = {
        username: trimmedUsername,
      };
      if (password) body.password = password;

      try {
        const res = await updateMe(body);
        if (res.access_token || res.refresh_token) {
          persistSession(res);
        }
      } catch (err) {
        const status = (err as Error & { status?: number }).status;
        const message = extractErrorMessage(err);
        if (status === 422 && message) {
          setSaveFeedback({ type: "error", message });
        } else {
          setSaveFeedback({
            type: "error",
            message: message ?? "Update failed.",
          });
        }
        return;
      }

      setPassword("");
      setConfirmPassword("");
      setSaveFeedback({
        type: "success",
        message: "Profile saved successfully.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePlayer = async () => {
    clearFeedback();
    setCreatingPlayer(true);
    try {
      const created = await createMyPlayer();
      setHasPlayer(true);
      applyPlayerDetails(created);
      setMessage(
        "Player profile created. You can now update your club, country, and bio."
      );
    } catch (err) {
      const message = extractErrorMessage(err);
      setError(message ?? "Failed to create player profile.");
    } finally {
      setCreatingPlayer(false);
    }
  };

  const handlePreferencesSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFeedback();
    if (!preferencesLoaded) {
      setPreferencesFeedback({
        type: "error",
        message: "Preferences are still loading. Please wait a moment.",
      });
      return;
    }
    setPreferencesSaving(true);
    try {
      const normalized = saveUserSettings(preferences);
      setPreferences(normalized);
      setInitialPreferences(normalized);
      setPreferencesFeedback({
        type: "success",
        message: "Preferences updated.",
      });
    } catch (err) {
      console.error("Failed to save preferences", err);
      setPreferencesFeedback({
        type: "error",
        message: "We couldn't save your preferences. Please try again.",
      });
    } finally {
      setPreferencesSaving(false);
    }
  };

  const continentCode = hasPlayer ? getContinentForCountry(countryCode) : null;
  const continentLabel =
    hasPlayer && continentCode ? CONTINENT_LABELS[continentCode] : null;
  const newLinkLabelError =
    error === SOCIAL_LINK_LABEL_REQUIRED_MESSAGE && !newLinkLabel.trim();
  const newLinkUrlError =
    error === INVALID_SOCIAL_URL_MESSAGE &&
    !isValidHttpUrl(newLinkUrl.trim());
  const preferencesDirty = !areUserSettingsEqual(
    preferences,
    initialPreferences,
  );
  const preferencesInputsDisabled = !preferencesLoaded || preferencesSaving;

  if (loading) {
    return (
      <main className="container">
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="container">
      <h1 className="heading">Profile</h1>
      <div className="auth-form">
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={username ? `${username} profile photo` : "Profile photo"}
            width={120}
            height={120}
            style={{ borderRadius: "50%", objectFit: "cover", marginBottom: 8 }}
          />
        )}
        <label htmlFor="profile-photo-input">Profile photo</label>
        <input
          id="profile-photo-input"
          type="file"
          accept="image/png,image/jpeg"
          onChange={handlePhotoChange}
        />
        {uploading && <span>Uploading…</span>}
      </div>
      <form onSubmit={handleSubmit} className="auth-form">
        <label className="form-field" htmlFor="profile-username">
          <span className="form-label">Display name</span>
          <input
            id="profile-username"
            type="text"
            value={username}
            onChange={(e) => {
              setSaveFeedback(null);
              setUsername(e.target.value);
            }}
            autoComplete="name"
          />
        </label>
        <label className="form-field" htmlFor="profile-password">
          <span className="form-label">New password</span>
          <input
            id="profile-password"
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => {
              setSaveFeedback(null);
              setPassword(e.target.value);
            }}
            autoComplete="new-password"
          />
        </label>
        <label className="form-field" htmlFor="profile-confirm-password">
          <span className="form-label">Confirm new password</span>
          <input
            id="profile-confirm-password"
            type="password"
            placeholder="Re-enter new password"
            value={confirmPassword}
            onChange={(e) => {
              setSaveFeedback(null);
              setConfirmPassword(e.target.value);
            }}
            autoComplete="new-password"
          />
        </label>
        {hasPlayer ? (
          <>
            <label className="form-field" htmlFor="profile-country">
              <span className="form-label">Country</span>
              <select
                id="profile-country"
                value={countryCode}
                onChange={(e) => {
                  setSaveFeedback(null);
                  setCountryCode(e.target.value);
                }}
              >
                <option value="">Select a country</option>
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <p
              style={{
                fontSize: "0.85rem",
                color: "#555",
                margin: "-0.25rem 0 0.75rem",
              }}
            >
              Selecting a country automatically fills your continent.
            </p>
            {continentLabel ? (
              <div
                className="form-field"
                aria-live="polite"
                style={{ gap: "0.25rem" }}
              >
                <span className="form-label">Continent</span>
                <div
                  data-testid="continent-display"
                  style={{ fontSize: "0.95rem", fontWeight: 500 }}
                >
                  {continentLabel}
                </div>
                <span style={{ fontSize: "0.85rem", color: "#555" }}>
                  This is set automatically based on your selected country.
                </span>
              </div>
            ) : null}
            <div className="form-field">
              <label className="form-label" htmlFor="profile-club-select">
                Favorite club
              </label>
              <ClubSelect
                value={clubId}
                onChange={(next) => {
                  setSaveFeedback(null);
                  setClubId(next);
                }}
                placeholder="Search for a club"
                searchInputId="profile-club-search"
                selectId="profile-club-select"
                searchLabel="Favorite club"
                name="club_id"
              />
            </div>
            <p
              style={{
                fontSize: "0.85rem",
                color: "#555",
                margin: "-0.25rem 0 0.75rem",
              }}
            >
              Leave blank if you do not want to show a favorite club.
            </p>
            <label
              style={{ display: "grid", gap: "0.5rem", width: "100%" }}
              htmlFor="profile-bio"
            >
              <span>Biography</span>
              <textarea
                id="profile-bio"
                value={bio}
                onChange={(e) => {
                  setSaveFeedback(null);
                  setBio(e.target.value);
                }}
                rows={4}
                maxLength={2000}
                placeholder="Tell other players about yourself"
                style={{
                  width: "100%",
                  minHeight: "6rem",
                  padding: "0.5rem",
                  fontFamily: "inherit",
                  fontSize: "1rem",
                  lineHeight: 1.4,
                  resize: "vertical",
                }}
              />
            </label>
          </>
        ) : (
          <div
            className="form-field"
            style={{
              display: "grid",
              gap: "0.5rem",
              border: "1px solid #d1d5db",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              background: "#f9fafb",
            }}
          >
            <p style={{ margin: 0, color: "#374151", lineHeight: 1.4 }}>
              You don’t have a player profile yet. Create one to set your
              country, favorite club, bio, and social links.
            </p>
            <button
              type="button"
              onClick={handleCreatePlayer}
              disabled={creatingPlayer}
            >
              {creatingPlayer ? "Creating player…" : "Create my player profile"}
            </button>
          </div>
        )}
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <div aria-live="polite">
          {saving ? (
            <p style={{ fontSize: "0.9rem", color: "#555" }}>Saving changes…</p>
          ) : null}
          {saveFeedback ? (
            <p
              role={saveFeedback.type === "error" ? "alert" : "status"}
              className={saveFeedback.type === "error" ? "error" : "success"}
              style={{ marginTop: "0.5rem" }}
            >
              {saveFeedback.message}
            </p>
          ) : null}
        </div>
      </form>
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <form
        onSubmit={handlePreferencesSubmit}
        className="auth-form"
        aria-labelledby="preferences-heading"
      >
        <h2
          id="preferences-heading"
          className="heading"
          style={{ fontSize: "1.25rem" }}
        >
          Preferences
        </h2>
        <label className="form-field" htmlFor="preferences-sport">
          <span className="form-label">Default leaderboard sport</span>
          <select
            id="preferences-sport"
            value={preferences.defaultLeaderboardSport}
            onChange={(event) => {
              setPreferencesFeedback(null);
              setMessage(null);
              setError(null);
              setPreferences((prev) => ({
                ...prev,
                defaultLeaderboardSport: event.target.value,
              }));
            }}
            disabled={preferencesInputsDisabled}
          >
            {SPORT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {formatSportOption(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field" htmlFor="preferences-country">
          <span className="form-label">Default leaderboard country</span>
          <select
            id="preferences-country"
            value={preferences.defaultLeaderboardCountry}
            onChange={(event) => {
              const nextValue = event.target.value;
              setPreferencesFeedback(null);
              setMessage(null);
              setError(null);
              setPreferences((prev) => ({
                ...prev,
                defaultLeaderboardCountry: nextValue,
              }));
            }}
            disabled={preferencesInputsDisabled}
          >
            <option value="">No default country</option>
            {COUNTRY_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <label
          className="form-field"
          htmlFor="preferences-weekly-summary"
          style={{ alignItems: "flex-start" }}
        >
          <span className="form-label" style={{ marginBottom: "0.25rem" }}>
            Weekly summary emails
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                id="preferences-weekly-summary"
                type="checkbox"
                checked={preferences.weeklySummaryEmails}
                onChange={(event) => {
                  setPreferencesFeedback(null);
                  setMessage(null);
                  setError(null);
                  setPreferences((prev) => ({
                    ...prev,
                    weeklySummaryEmails: event.target.checked,
                  }));
                }}
                disabled={preferencesInputsDisabled}
              />
              <span>Send me a recap email of new matches once per week.</span>
            </div>
            <p style={{ fontSize: "0.85rem", color: "#555", margin: 0 }}>
              We only send emails when there are new matches from clubs you follow.
            </p>
          </div>
        </label>
        <button
          type="submit"
          disabled={preferencesInputsDisabled || !preferencesDirty}
        >
          {preferencesSaving ? "Saving preferences…" : "Save preferences"}
        </button>
        <div aria-live="polite">
          {preferencesSaving ? (
            <p style={{ fontSize: "0.9rem", color: "#555" }}>
              Saving your preferences…
            </p>
          ) : null}
          {preferencesFeedback ? (
            <p
              role={preferencesFeedback.type === "error" ? "alert" : "status"}
              className={
                preferencesFeedback.type === "error" ? "error" : "success"
              }
              style={{ marginTop: "0.5rem" }}
            >
              {preferencesFeedback.message}
            </p>
          ) : null}
        </div>
      </form>
      <section className="auth-form" aria-labelledby="social-links-heading">
        <h2 id="social-links-heading" className="heading" style={{ fontSize: "1.25rem" }}>
          Social links
        </h2>
        {hasPlayer ? (
          <>
            {socialLinks.length ? (
              socialLinks.map((link) => {
            const draft = linkDrafts[link.id] ?? { label: "", url: "" };
            const trimmedLabel = draft.label.trim();
            const trimmedUrl = draft.url.trim();
            const unchanged =
              trimmedLabel === link.label && trimmedUrl === link.url;
            const busy =
              linkSavingId === link.id || linkDeletingId === link.id || linkSubmitting;
            const labelInputId = `social-link-${link.id}-label`;
            const urlInputId = `social-link-${link.id}-url`;
            const labelHasError =
              error === SOCIAL_LINK_LABEL_REQUIRED_MESSAGE && !trimmedLabel;
            const urlHasError =
              error === INVALID_SOCIAL_URL_MESSAGE && !isValidHttpUrl(trimmedUrl);
                return (
              <div
                key={link.id}
                style={{
                  display: "grid",
                  gap: "0.5rem",
                  marginBottom: "1rem",
                }}
              >
                <label className="sr-only" htmlFor={labelInputId}>
                  Social link label
                </label>
                <input
                  id={labelInputId}
                  type="text"
                  value={draft.label}
                  onChange={(e) =>
                    setLinkDrafts((prev) => ({
                      ...prev,
                      [link.id]: { label: e.target.value, url: draft.url },
                    }))
                  }
                  placeholder="Label"
                  aria-invalid={labelHasError ? true : undefined}
                />
                <label className="sr-only" htmlFor={urlInputId}>
                  Social link URL
                </label>
                <input
                  id={urlInputId}
                  type="url"
                  value={draft.url}
                  onChange={(e) =>
                    setLinkDrafts((prev) => ({
                      ...prev,
                      [link.id]: { label: draft.label, url: e.target.value },
                    }))
                  }
                  placeholder="https://example.com"
                  aria-invalid={urlHasError ? true : undefined}
                  aria-describedby="social-link-url-hint"
                />
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    disabled={busy || unchanged}
                  onClick={async () => {
                      const nextLabel = trimmedLabel;
                      const nextUrl = trimmedUrl;
                      if (!nextLabel) {
                        setError(SOCIAL_LINK_LABEL_REQUIRED_MESSAGE);
                        setMessage(null);
                        setPreferencesFeedback(null);
                        setSaveFeedback(null);
                        return;
                      }
                      if (!isValidHttpUrl(nextUrl)) {
                        setError(INVALID_SOCIAL_URL_MESSAGE);
                        setMessage(null);
                        setPreferencesFeedback(null);
                        setSaveFeedback(null);
                        return;
                      }
                      clearFeedback();
                      setLinkSavingId(link.id);
                      try {
                        const updated = await updateMySocialLink(link.id, {
                          label: nextLabel,
                          url: nextUrl,
                        });
                        const nextLinks = socialLinks.map((existing) =>
                          existing.id === link.id ? updated : existing
                        );
                        resetSocialLinkState(nextLinks);
                        setMessage("Social link updated");
                      } catch (err) {
                        const message = extractErrorMessage(err);
                        setError(message ?? "Failed to update social link");
                        setPreferencesFeedback(null);
                        setSaveFeedback(null);
                      } finally {
                        setLinkSavingId(null);
                      }
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      clearFeedback();
                      setLinkDeletingId(link.id);
                      try {
                        await deleteMySocialLink(link.id);
                        const nextLinks = socialLinks.filter(
                          (existing) => existing.id !== link.id
                        );
                        resetSocialLinkState(nextLinks);
                        setMessage("Social link removed");
                      } catch (err) {
                        const message = extractErrorMessage(err);
                        setError(message ?? "Failed to remove social link");
                        setPreferencesFeedback(null);
                        setSaveFeedback(null);
                      } finally {
                        setLinkDeletingId(null);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
                );
              })
            ) : (
              <p style={{ marginBottom: "1rem" }}>No social links yet.</p>
            )}
            <form
              onSubmit={async (e) => {
            e.preventDefault();
            clearFeedback();
            const label = newLinkLabel.trim();
            const url = newLinkUrl.trim();
            if (!label) {
              setError(SOCIAL_LINK_LABEL_REQUIRED_MESSAGE);
              setPreferencesFeedback(null);
              setSaveFeedback(null);
              return;
            }
            if (!isValidHttpUrl(url)) {
              setError(INVALID_SOCIAL_URL_MESSAGE);
              setPreferencesFeedback(null);
              setSaveFeedback(null);
              return;
            }
                setLinkSubmitting(true);
                try {
                  const created = await createMySocialLink({ label, url });
                  const nextLinks = [...socialLinks, created];
                  resetSocialLinkState(nextLinks);
                  setNewLinkLabel("");
                  setNewLinkUrl("");
                  setMessage("Social link added");
                  setSaveFeedback(null);
                } catch (err) {
                  const message = extractErrorMessage(err);
                  setError(message ?? "Failed to add social link");
                  setPreferencesFeedback(null);
                  setSaveFeedback(null);
                } finally {
                  setLinkSubmitting(false);
                }
              }}
              style={{ display: "grid", gap: "0.5rem" }}
            >
              <label className="sr-only" htmlFor="social-link-new-label">
                New social link label
              </label>
              <input
                id="social-link-new-label"
                type="text"
                value={newLinkLabel}
                onChange={(e) => setNewLinkLabel(e.target.value)}
                placeholder="Label"
                aria-invalid={newLinkLabelError ? true : undefined}
              />
              <label className="sr-only" htmlFor="social-link-new-url">
                New social link URL
              </label>
              <input
                id="social-link-new-url"
                type="url"
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="https://example.com"
                aria-invalid={newLinkUrlError ? true : undefined}
                aria-describedby="social-link-url-hint"
              />
              <button type="submit" disabled={linkSubmitting}>
                Add link
              </button>
            </form>
            <p
              id="social-link-url-hint"
              style={{ fontSize: "0.85rem", color: "#555" }}
            >
              URLs must include http:// or https:// and a valid hostname.
            </p>
          </>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "0.5rem",
              border: "1px solid #d1d5db",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              background: "#f9fafb",
            }}
          >
            <p style={{ margin: 0, color: "#374151", lineHeight: 1.4 }}>
              Create your player profile to share social links with other players.
            </p>
            <button
              type="button"
              onClick={handleCreatePlayer}
              disabled={creatingPlayer}
            >
              {creatingPlayer ? "Creating player…" : "Create my player profile"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
