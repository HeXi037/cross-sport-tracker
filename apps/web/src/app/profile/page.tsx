"use client";

import {
  useEffect,
  useState,
  useCallback,
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
  createMySocialLink,
  updateMySocialLink,
  deleteMySocialLink,
} from "../../lib/api";
import type { PlayerLocationPayload, PlayerSocialLink } from "../../lib/api";
import {
  COUNTRY_OPTIONS,
  getContinentForCountry,
  CONTINENT_LABELS,
} from "../../lib/countries";

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
const HTTP_URL_PATTERN = /^https?:\/\//i;

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

export default function ProfilePage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [countryCode, setCountryCode] = useState("");
  const [clubId, setClubId] = useState("");
  const [initialCountryCode, setInitialCountryCode] = useState("");
  const [initialClubId, setInitialClubId] = useState("");
  const [saving, setSaving] = useState(false);
  const [socialLinks, setSocialLinks] = useState<PlayerSocialLink[]>([]);
  const [linkDrafts, setLinkDrafts] = useState<
    Record<string, { label: string; url: string }>
  >({});
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [linkSavingId, setLinkSavingId] = useState<string | null>(null);
  const [linkDeletingId, setLinkDeletingId] = useState<string | null>(null);

  const sortSocialLinks = useCallback((links: PlayerSocialLink[]) => {
    return [...links].sort((a, b) => {
      const positionDiff = a.position - b.position;
      if (positionDiff !== 0) return positionDiff;
      return a.label.localeCompare(b.label);
    });
  }, []);

  const initializeSocialLinks = useCallback(
    (links: PlayerSocialLink[]) => {
      const sorted = sortSocialLinks(links);
      setSocialLinks(sorted);
      const drafts: Record<string, { label: string; url: string }> = {};
      for (const link of sorted) {
        drafts[link.id] = { label: link.label, url: link.url };
      }
      setLinkDrafts(drafts);
    },
    [sortSocialLinks]
  );

  const handleDraftChange = useCallback(
    (id: string, field: "label" | "url", value: string) => {
      setLinkDrafts((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] ?? { label: "", url: "" }),
          [field]: value,
        },
      }));
    },
    []
  );

  const handleNewLinkChange = useCallback(
    (field: "label" | "url", value: string) => {
      if (field === "label") {
        setNewLinkLabel(value);
      } else {
        setNewLinkUrl(value);
      }
    },
    []
  );

  const handleAddSocialLink = useCallback(async () => {
    const trimmedLabel = newLinkLabel.trim();
    const trimmedUrl = newLinkUrl.trim();
    setError(null);
    setMessage(null);
    if (!trimmedLabel) {
      setError("Link label is required");
      return;
    }
    if (!trimmedUrl) {
      setError("Link URL is required");
      return;
    }
    if (!HTTP_URL_PATTERN.test(trimmedUrl)) {
      setError("Links must start with http:// or https://");
      return;
    }
    setAddingLink(true);
    try {
      const created = await createMySocialLink({
        label: trimmedLabel,
        url: trimmedUrl,
      });
      setSocialLinks((prev) => sortSocialLinks([...prev, created]));
      setLinkDrafts((prev) => ({
        ...prev,
        [created.id]: { label: created.label, url: created.url },
      }));
      setNewLinkLabel("");
      setNewLinkUrl("");
      setMessage("Social link added");
    } catch (err) {
      const message = extractErrorMessage(err);
      setError(message ?? "Failed to add social link");
    } finally {
      setAddingLink(false);
    }
  }, [newLinkLabel, newLinkUrl, sortSocialLinks]);

  const handleSaveSocialLink = useCallback(
    async (id: string) => {
      const draft = linkDrafts[id];
      if (!draft) return;
      const trimmedLabel = draft.label.trim();
      const trimmedUrl = draft.url.trim();
      setError(null);
      setMessage(null);
      if (!trimmedLabel) {
        setError("Link label is required");
        return;
      }
      if (!trimmedUrl) {
        setError("Link URL is required");
        return;
      }
      if (!HTTP_URL_PATTERN.test(trimmedUrl)) {
        setError("Links must start with http:// or https://");
        return;
      }
      setLinkSavingId(id);
      try {
        const current = socialLinks.find((link) => link.id === id);
        const payload = {
          label: trimmedLabel,
          url: trimmedUrl,
          position: current?.position,
        };
        const updated = await updateMySocialLink(id, payload);
        setSocialLinks((prev) =>
          sortSocialLinks(prev.map((link) => (link.id === id ? updated : link)))
        );
        setLinkDrafts((prev) => ({
          ...prev,
          [id]: { label: updated.label, url: updated.url },
        }));
        setMessage("Social link updated");
      } catch (err) {
        const message = extractErrorMessage(err);
        setError(message ?? "Failed to update social link");
      } finally {
        setLinkSavingId(null);
      }
    },
    [linkDrafts, socialLinks, sortSocialLinks]
  );

  const handleDeleteSocialLink = useCallback(
    async (id: string) => {
      setError(null);
      setMessage(null);
      setLinkDeletingId(id);
      try {
        await deleteMySocialLink(id);
        setSocialLinks((prev) => prev.filter((link) => link.id !== id));
        setLinkDrafts((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setMessage("Social link removed");
      } catch (err) {
        const message = extractErrorMessage(err);
        setError(message ?? "Failed to remove social link");
      } finally {
        setLinkDeletingId(null);
      }
    },
    []
  );

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    let active = true;
    (async () => {
      try {
        const me = await fetchMe();
        if (!active) return;
        setUsername(me.username);
        setPhotoUrl(me.photo_url ?? null);
        try {
          const player = await fetchMyPlayer();
          if (!active) return;
          const nextCountry = player.country_code ?? "";
          const nextClub = player.club_id ?? "";
          setCountryCode(nextCountry);
          setClubId(nextClub);
          setInitialCountryCode(nextCountry);
          setInitialClubId(nextClub);
          initializeSocialLinks(player.social_links ?? []);
          setNewLinkLabel("");
          setNewLinkUrl("");
        } catch (playerErr) {
          if (!active) return;
          const status = (playerErr as Error & { status?: number }).status;
          if (status === 401) {
            router.push("/login");
            return;
          }
          if (status === 404) {
            setCountryCode("");
            setInitialCountryCode("");
            setClubId("");
            setInitialClubId("");
            initializeSocialLinks([]);
            setNewLinkLabel("");
            setNewLinkUrl("");
          } else {
            console.error("Failed to load player profile", playerErr);
            setError("Failed to load profile");
            setMessage(null);
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
  }, [initializeSocialLinks, router]);

  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setMessage(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch("/v0/auth/me/photo", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as { photo_url?: string };
      setPhotoUrl(data.photo_url ?? null);
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
    setError(null);
    setMessage(null);
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }
    if (password && (password.length < 12 || !PASSWORD_REGEX.test(password))) {
      setError(
        "Password must be at least 12 characters and include letters, numbers, and symbols",
      );
      return;
    }
    const normalizedCountry = countryCode.trim().toUpperCase();
    const trimmedClubId = clubId.trim();

    const hasValidCountry =
      !normalizedCountry ||
      COUNTRY_OPTIONS.some((option) => option.code === normalizedCountry);
    if (!hasValidCountry) {
      setError("Please select a valid country");
      return;
    }

    const continentCode = normalizedCountry
      ? getContinentForCountry(normalizedCountry)
      : undefined;

    setUsername(trimmedUsername);
    setCountryCode(normalizedCountry);
    setClubId(trimmedClubId);

    const countryChanged = normalizedCountry !== initialCountryCode;
    const clubChanged = trimmedClubId !== initialClubId;

    const payload: PlayerLocationPayload = {};

    if (countryChanged) {
      payload.country_code = normalizedCountry ? normalizedCountry : null;
      payload.location = normalizedCountry ? normalizedCountry : null;
      payload.region_code = normalizedCountry
        ? continentCode ?? null
        : null;
    }

    if (clubChanged) {
      payload.club_id = trimmedClubId ? trimmedClubId : null;
    }

    setSaving(true);
    try {
      if (Object.keys(payload).length > 0) {
        try {
          const updatedPlayer = await updateMyPlayerLocation(payload);
          const nextCountry = updatedPlayer.country_code ?? "";
          const nextClub = updatedPlayer.club_id ?? "";
          setCountryCode(nextCountry);
          setClubId(nextClub);
          setInitialCountryCode(nextCountry);
          setInitialClubId(nextClub);
        } catch (err) {
          const status = (err as Error & { status?: number }).status;
          if (status === 422) {
            setError("Invalid location. Please choose a different country or club.");
          } else {
            const message = extractErrorMessage(err);
            setError(message ?? "Failed to update location settings");
          }
          return;
        }
      } else {
        setInitialCountryCode(normalizedCountry);
        setInitialClubId(trimmedClubId);
      }

      const body: { username: string; password?: string } = {
        username: trimmedUsername,
      };
      if (password) body.password = password;

      try {
        const res = await updateMe(body);
        if (res.access_token) {
          window.localStorage.setItem("token", res.access_token);
          window.dispatchEvent(new Event("storage"));
        }
      } catch (err) {
        const status = (err as Error & { status?: number }).status;
        const message = extractErrorMessage(err);
        if (status === 422 && message) {
          setError(message);
        } else {
          setError(message ?? "Update failed");
        }
        return;
      }

      setPassword("");
      setError(null);
      setMessage("Profile updated");
    } finally {
      setSaving(false);
    }
  };

  const continentCode = getContinentForCountry(countryCode);
  const continentLabel = continentCode ? CONTINENT_LABELS[continentCode] : null;

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
        <label>
          Profile photo
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={handlePhotoChange}
          />
        </label>
        {uploading && <span>Uploading…</span>}
      </div>
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <select
          aria-label="Country"
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value)}
        >
          <option value="">Select a country</option>
          {COUNTRY_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
        </select>
        <div style={{ fontSize: "0.9rem", color: "#555" }}>
          Continent: {continentLabel ?? "—"}
        </div>
        <input
          type="text"
          aria-label="Favorite club"
          placeholder="Favorite club"
          value={clubId}
          onChange={(e) => setClubId(e.target.value)}
        />
        <button type="submit" disabled={saving}>
          Save
        </button>
      </form>
      <section className="auth-form" aria-labelledby="social-links-heading">
        <h2 id="social-links-heading" className="heading">
          Social links
        </h2>
        {socialLinks.length ? (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, width: "100%" }}>
            {socialLinks.map((link) => {
              const draft = linkDrafts[link.id] ?? { label: "", url: "" };
              const savingLink = linkSavingId === link.id;
              const deletingLink = linkDeletingId === link.id;
              return (
                <li key={link.id} style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Label"
                      value={draft.label}
                      onChange={(e) =>
                        handleDraftChange(link.id, "label", e.target.value)
                      }
                    />
                    <input
                      type="url"
                      placeholder="https://example.com"
                      value={draft.url}
                      onChange={(e) =>
                        handleDraftChange(link.id, "url", e.target.value)
                      }
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => handleSaveSocialLink(link.id)}
                        disabled={savingLink || deletingLink}
                      >
                        {savingLink ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSocialLink(link.id)}
                        disabled={savingLink || deletingLink}
                      >
                        {deletingLink ? "Removing…" : "Remove"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>No social links yet.</p>
        )}
        <div style={{ marginTop: 12 }}>
          <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Add new link</h3>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
            }}
          >
            <input
              type="text"
              placeholder="Label"
              value={newLinkLabel}
              onChange={(e) => handleNewLinkChange("label", e.target.value)}
            />
            <input
              type="url"
              placeholder="https://example.com"
              value={newLinkUrl}
              onChange={(e) => handleNewLinkChange("url", e.target.value)}
            />
            <button
              type="button"
              onClick={handleAddSocialLink}
              disabled={addingLink}
            >
              {addingLink ? "Adding…" : "Add link"}
            </button>
          </div>
        </div>
      </section>
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
    </main>
  );
}
