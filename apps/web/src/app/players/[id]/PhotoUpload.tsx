'use client';

import { useEffect, useState } from 'react';
import {
  SESSION_ENDED_EVENT,
  apiFetch,
  currentUserId,
  ensureAbsoluteApiUrl,
  isLoggedIn,
} from '../../../lib/api';

interface Props {
  playerId: string;
  initialUrl?: string | null;
}

type SessionState = {
  loggedIn: boolean;
  userId: string | null;
};

export default function PhotoUpload({ playerId, initialUrl }: Props) {
  const [url, setUrl] = useState<string | null | undefined>(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<
    | { type: 'idle'; message: null }
    | { type: 'success' | 'error'; message: string }
  >({ type: 'idle', message: null });
  const [session, setSession] = useState<SessionState>(() => ({
    loggedIn: isLoggedIn(),
    userId: currentUserId(),
  }));

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const updateSession = () =>
      setSession({
        loggedIn: isLoggedIn(),
        userId: currentUserId(),
      });

    const handleSessionEnded = () => updateSession();

    window.addEventListener('storage', updateSession);
    window.addEventListener(SESSION_ENDED_EVENT, handleSessionEnded);

    return () => {
      window.removeEventListener('storage', updateSession);
      window.removeEventListener(SESSION_ENDED_EVENT, handleSessionEnded);
    };
  }, []);

  const canUpload = session.loggedIn && session.userId === playerId;

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canUpload) {
      e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus({ type: 'idle', message: null });

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/avif',
    ];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (file.type && !allowedTypes.includes(file.type)) {
      setStatus({
        type: 'error',
        message: 'Please choose a JPEG, PNG, GIF, WebP, or AVIF image.',
      });
      e.target.value = '';
      return;
    }

    if (file.size > maxSize) {
      setStatus({
        type: 'error',
        message: 'Please choose an image smaller than 5MB.',
      });
      e.target.value = '';
      return;
    }

    const form = new FormData();
    form.append('file', file);
    setUploading(true);
    try {
      const r = await apiFetch(`/v0/players/${playerId}/photo`, {
        method: 'POST',
        body: form,
      });
      if (!r.ok) {
        throw new Error(`Upload failed with status ${r.status}`);
      }
      const data = (await r.json()) as { photo_url?: string };
      setUrl(
        typeof data.photo_url === 'string' && data.photo_url
          ? ensureAbsoluteApiUrl(data.photo_url)
          : null
      );
      setStatus({ type: 'success', message: 'Photo updated successfully.' });
    } catch (error) {
      console.error('Failed to upload player photo', error);
      setStatus({
        type: 'error',
        message: 'Unable to upload the photo right now. Please try again.',
      });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="mb-4">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Current player photo"
          width={120}
          height={120}
          style={{ borderRadius: '50%', objectFit: 'cover', marginBottom: 8 }}
        />
      )}
      {canUpload && (
        <>
          <label className="form-field" htmlFor="player-photo-upload">
            <span className="form-label">Update player photo</span>
            <input
              id="player-photo-upload"
              type="file"
              accept="image/*"
              onChange={onChange}
              disabled={uploading}
            />
          </label>
          {uploading && (
            <div className="photo-upload__status" role="status" aria-live="polite">
              <span className="photo-upload__spinner" aria-hidden="true" />
              <span>Uploading photo…</span>
            </div>
          )}
          {status.type !== 'idle' && status.message && (
            <p
              className={`photo-upload__message photo-upload__message--${status.type}`}
              role={status.type === 'error' ? 'alert' : 'status'}
              aria-live={status.type === 'error' ? 'assertive' : 'polite'}
            >
              {status.message}
            </p>
          )}
        </>
      )}
    </div>
  );
}
