'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

interface Props {
  id: string;
  name?: string;
  photoUrl?: string | null;
}

export default function PlayerLabel({ id, name: initialName, photoUrl: initialPhoto }: Props) {
  const [name, setName] = useState(initialName || '');
  const [photoUrl, setPhotoUrl] = useState<string | null | undefined>(initialPhoto);

  useEffect(() => {
    if (initialName !== undefined && initialPhoto !== undefined) return;
    async function load() {
      try {
        const res = await apiFetch(`/v0/players/${encodeURIComponent(id)}`);
        if (res?.ok) {
          const data = (await res.json()) as { name: string; photo_url?: string | null };
          if (initialName === undefined) setName(data.name);
          if (initialPhoto === undefined) setPhotoUrl(data.photo_url ?? null);
        }
      } catch {
        // ignore fetch errors in offline/tests environments
      }
    }
    load();
  }, [id, initialName, initialPhoto]);

  return (
    <span className="inline-flex items-center">
      {photoUrl && (
        <img
          src={photoUrl}
          alt={name}
          className="w-6 h-6 rounded-full mr-1 object-cover"
        />
      )}
      <span>{name || id}</span>
    </span>
  );
}

