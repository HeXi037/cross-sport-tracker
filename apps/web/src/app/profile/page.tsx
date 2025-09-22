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

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;
const REGION_CODE_REGEX = /^[A-Z0-9]{1,3}$/;

function normalizeCodeInput(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
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

export default function ProfilePage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [location, setLocation] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [regionCode, setRegionCode] = useState("");
  const [initialLocation, setInitialLocation] = useState("");
  const [initialCountryCode, setInitialCountryCode] = useState("");
  const [initialRegionCode, setInitialRegionCode] = useState("");
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
          const nextLocation = player.location ?? "";
          const nextCountry = player.country_code ?? "";
          const nextRegion = player.region_code ?? "";
          setLocation(nextLocation);
          setCountryCode(nextCountry);
          setRegionCode(nextRegion);
          setInitialLocation(nextLocation);
          setInitialCountryCode(nextCountry);
          setInitialRegionCode(nextRegion);
        } catch (playerErr) {
          if (!active) return;
          const status = (playerErr as Error & { status?: number }).status;
          if (status === 401) {
            router.push("/login");
            return;
          }
          if (status === 404) {
            setLocation("");
            setCountryCode("");
            setRegionCode("");
            setInitialLocation("");
            setInitialCountryCode("");
            setInitialRegionCode("");
          } else {
            console.error("Failed to load player profile", playerErr);
            setError("Failed to load profile");
            setMessage(null);
          }
        }
      } catch (err) {
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
    const normalizedCountry = normalizeCodeInput(countryCode);
    const normalizedRegion = normalizeCodeInput(regionCode);
    const trimmedLocation = location.trim();

    if (normalizedCountry && !COUNTRY_CODE_REGEX.test(normalizedCountry)) {
      setError("Country code must be exactly 2 letters");
      return;
    }

    if (normalizedRegion && !REGION_CODE_REGEX.test(normalizedRegion)) {
      setError("Region code must be 1-3 letters or numbers");
      return;
    }

    if (normalizedRegion && !normalizedCountry) {
      setError("Country code is required when setting a region");
      return;
    }

    setUsername(trimmedUsername);
    setLocation(trimmedLocation);
    setCountryCode(normalizedCountry);
    setRegionCode(normalizedRegion);

    const locationChanged =
      trimmedLocation !== initialLocation ||
      normalizedCountry !== initialCountryCode ||
      normalizedRegion !== initialRegionCode;

    setSaving(true);
    try {
      if (locationChanged) {
        try {
          const updatedPlayer = await updateMyPlayerLocation({
            location: trimmedLocation ? trimmedLocation : null,
            country_code: normalizedCountry ? normalizedCountry : null,
            region_code: normalizedRegion ? normalizedRegion : null,
          });
          const nextLocation = updatedPlayer.location ?? "";
          const nextCountry = updatedPlayer.country_code ?? "";
          const nextRegion = updatedPlayer.region_code ?? "";
          setLocation(nextLocation);
          setCountryCode(nextCountry);
          setRegionCode(nextRegion);
          setInitialLocation(nextLocation);
          setInitialCountryCode(nextCountry);
          setInitialRegionCode(nextRegion);
        } catch (err) {
          const status = (err as Error & { status?: number }).status;
          if (status === 422) {
            setError("Invalid location. Please check the country or region codes.");
          } else {
            const message = extractErrorMessage(err);
            setError(message ?? "Failed to update location");
          }
          return;
        }
      } else {
        setInitialLocation(trimmedLocation);
        setInitialCountryCode(normalizedCountry);
        setInitialRegionCode(normalizedRegion);
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
        <input
          type="text"
          aria-label="Location"
          placeholder="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <input
          type="text"
          aria-label="Country code"
          placeholder="Country code"
          value={countryCode}
          onChange={(e) => setCountryCode(normalizeCodeInput(e.target.value))}
        />
        <input
          type="text"
          aria-label="Region code"
          placeholder="Region code"
          value={regionCode}
          onChange={(e) => setRegionCode(normalizeCodeInput(e.target.value))}
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
