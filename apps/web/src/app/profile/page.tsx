"use client";

import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
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
  type PlayerSocialLink,
} from "../../lib/api";
import type { PlayerLocationPayload } from "../../lib/api";
import ClubSelect from "../../components/ClubSelect";
import {
  COUNTRY_OPTIONS,
  getContinentForCountry,
  CONTINENT_LABELS,
} from "../../lib/countries";

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

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
  const [bio, setBio] = useState("");
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

  const resetSocialLinkState = (links: PlayerSocialLink[]) => {
    setSocialLinks(links);
    setLinkDrafts(
      Object.fromEntries(
        links.map((link) => [link.id, { label: link.label, url: link.url }])
      ) as Record<string, { label: string; url: string }>
    );
  };

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
          const nextBio = player.bio ?? "";
          const nextLinks = player.social_links ?? [];
          setCountryCode(nextCountry);
          setClubId(nextClub);
          setBio(nextBio);
          setInitialCountryCode(nextCountry);
          setInitialClubId(nextClub);
          setInitialBio(nextBio);
          resetSocialLinkState(nextLinks);
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
            setBio("");
            setInitialBio("");
            resetSocialLinkState([]);
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
  }, [router]);

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
    const trimmedBio = bio.trim();
    const initialBioTrimmed = initialBio.trim();

    setUsername(trimmedUsername);
    setCountryCode(normalizedCountry);
    setClubId(trimmedClubId);

    const countryChanged = normalizedCountry !== initialCountryCode;
    const clubChanged = trimmedClubId !== initialClubId;
    const bioChanged = trimmedBio !== initialBioTrimmed;

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

    if (bioChanged) {
      payload.bio = trimmedBio ? trimmedBio : null;
    }

    setSaving(true);
    try {
      if (Object.keys(payload).length > 0) {
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
        setBio(trimmedBio);
        setInitialBio(trimmedBio);
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
        <ClubSelect
          value={clubId}
          onChange={setClubId}
          placeholder="Favorite club"
          ariaLabel="Favorite club"
          name="club_id"
        />
        <label
          style={{ display: "grid", gap: "0.5rem", width: "100%" }}
          htmlFor="profile-bio"
        >
          <span>Biography</span>
          <textarea
            id="profile-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
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
        <button type="submit" disabled={saving}>
          Save
        </button>
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
      <section className="auth-form" aria-labelledby="social-links-heading">
        <h2 id="social-links-heading" className="heading" style={{ fontSize: "1.25rem" }}>
          Social links
        </h2>
        {socialLinks.length ? (
          socialLinks.map((link) => {
            const draft = linkDrafts[link.id] ?? { label: "", url: "" };
            const trimmedLabel = draft.label.trim();
            const trimmedUrl = draft.url.trim();
            const unchanged =
              trimmedLabel === link.label && trimmedUrl === link.url;
            const busy =
              linkSavingId === link.id || linkDeletingId === link.id || linkSubmitting;
            return (
              <div
                key={link.id}
                style={{
                  display: "grid",
                  gap: "0.5rem",
                  marginBottom: "1rem",
                }}
              >
                <input
                  type="text"
                  value={draft.label}
                  onChange={(e) =>
                    setLinkDrafts((prev) => ({
                      ...prev,
                      [link.id]: { label: e.target.value, url: draft.url },
                    }))
                  }
                  placeholder="Label"
                />
                <input
                  type="url"
                  value={draft.url}
                  onChange={(e) =>
                    setLinkDrafts((prev) => ({
                      ...prev,
                      [link.id]: { label: draft.label, url: e.target.value },
                    }))
                  }
                  placeholder="https://example.com"
                />
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    disabled={busy || unchanged}
                    onClick={async () => {
                      const nextLabel = trimmedLabel;
                      const nextUrl = trimmedUrl;
                      if (!nextLabel) {
                        setError("Link label is required");
                        setMessage(null);
                        return;
                      }
                      if (!/^https?:\/\//i.test(nextUrl)) {
                        setError(
                          "Social link URL must start with http:// or https://"
                        );
                        setMessage(null);
                        return;
                      }
                      setError(null);
                      setMessage(null);
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
                      setError(null);
                      setMessage(null);
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
            setError(null);
            setMessage(null);
            const label = newLinkLabel.trim();
            const url = newLinkUrl.trim();
            if (!label) {
              setError("Link label is required");
              return;
            }
            if (!/^https?:\/\//i.test(url)) {
              setError("Social link URL must start with http:// or https://");
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
            } catch (err) {
              const message = extractErrorMessage(err);
              setError(message ?? "Failed to add social link");
            } finally {
              setLinkSubmitting(false);
            }
          }}
          style={{ display: "grid", gap: "0.5rem" }}
        >
          <input
            type="text"
            value={newLinkLabel}
            onChange={(e) => setNewLinkLabel(e.target.value)}
            placeholder="Label"
          />
          <input
            type="url"
            value={newLinkUrl}
            onChange={(e) => setNewLinkUrl(e.target.value)}
            placeholder="https://example.com"
          />
          <button type="submit" disabled={linkSubmitting}>
            Add link
          </button>
        </form>
        <p style={{ fontSize: "0.85rem", color: "#555" }}>
          URLs must start with http:// or https://.
        </p>
      </section>
    </main>
  );
}
