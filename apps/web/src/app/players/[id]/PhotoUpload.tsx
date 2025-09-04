'use client';

import { useState } from 'react';
import { apiFetch, isAdmin } from '../../../lib/api';

interface Props {
  playerId: string;
}

export default function PhotoUpload({ playerId }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const admin = isAdmin();

  async function upload() {
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      await apiFetch(`/v0/players/${encodeURIComponent(playerId)}/photo`, {
        method: 'POST',
        body: form,
      });
      location.reload();
    } finally {
      setUploading(false);
    }
  }

  if (!admin) return null;

  return (
    <div className="my-2">
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <button onClick={upload} disabled={!file || uploading} className="ml-2 button">
        {uploading ? 'Uploading…' : 'Upload'}
      </button>
    </div>
  );
}

