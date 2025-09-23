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
          setCountryCode(nextCountry);
          setClubId(nextClub);
          setBio(nextBio);
          setInitialCountryCode(nextCountry);
          setInitialClubId(nextClub);
          setInitialBio(nextBio);
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

    setUsername(trimmedUsername);
    setCountryCode(normalizedCountry);
    setClubId(trimmedClubId);

    const countryChanged = normalizedCountry !== initialCountryCode;
    const clubChanged = trimmedClubId !== initialClubId;
    const trimmedBio = bio.trim();
    const normalizedBio = trimmedBio.length > 0 ? trimmedBio : null;
    const bioChanged = bio !== initialBio;

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
      payload.bio = normalizedBio;
    }

    setSaving(true);
    try {
      if (Object.keys(payload).length > 0) {
        try {
          const updatedPlayer = await updateMyPlayerLocation(payload);
          const nextCountry = updatedPlayer.country_code ?? "";
          const nextClub = updatedPlayer.club_id ?? "";
          const nextBio = updatedPlayer.bio ?? "";
          setCountryCode(nextCountry);
          setClubId(nextClub);
          setBio(nextBio);
          setInitialCountryCode(nextCountry);
          setInitialClubId(nextClub);
          setInitialBio(nextBio);
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
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Biography
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder="Share a few lines about yourself"
            style={{ resize: "vertical" }}
          />
        </label>
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
    </main>
  );
}
