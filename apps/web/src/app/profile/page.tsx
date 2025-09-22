"use client";

import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { fetchMe, updateMe, isLoggedIn, apiFetch } from "../../lib/api";

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

export default function ProfilePage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    fetchMe()
      .then((data) => {
        setUsername(data.username);
        setPhotoUrl(data.photo_url ?? null);
        setLoading(false);
      })
      .catch(() => router.push("/login"));
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
    const trimmed = username.trim();
    if (trimmed.length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }
    if (password && (password.length < 12 || !PASSWORD_REGEX.test(password))) {
      setError(
        "Password must be at least 12 characters and include letters, numbers, and symbols",
      );
      return;
    }
    try {
      const body: { username: string; password?: string } = { username: trimmed };
      if (password) body.password = password;
      const res = await updateMe(body);
      if (res.access_token) {
        window.localStorage.setItem("token", res.access_token);
        window.dispatchEvent(new Event("storage"));
      }
      setPassword("");
      setMessage("Profile updated");
    } catch {
      setError("Update failed");
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
        <button type="submit">Save</button>
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
