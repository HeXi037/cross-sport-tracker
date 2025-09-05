"use client";
import { useState } from "react";
import { apiFetch } from "../../../lib/api";

interface Props {
  playerId: string;
  initialUrl?: string | null;
}

export default function PhotoUpload({ playerId, initialUrl }: Props) {
  const [url, setUrl] = useState<string | null | undefined>(initialUrl);
  const [uploading, setUploading] = useState(false);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    setUploading(true);
    const r = await apiFetch(`/v0/players/${playerId}/photo`, {
      method: "POST",
      body: form,
    });
    if (r.ok) {
      const data = (await r.json()) as { photo_url?: string };
      setUrl(data.photo_url ?? null);
    }
    setUploading(false);
  };

  return (
    <div className="mb-4">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="player photo"
          width={120}
          height={120}
          style={{ borderRadius: '50%', objectFit: 'cover', marginBottom: 8 }}
        />
      )}
      <input type="file" accept="image/*" onChange={onChange} />
      {uploading && <span>Uploading…</span>}
    </div>
  );
}
