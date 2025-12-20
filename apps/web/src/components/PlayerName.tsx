"use client";

// apps/web/src/components/PlayerName.tsx (update)
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { normalizePhotoUrl } from '../lib/api';
import { getInitials } from '../lib/names';

export type PlayerInfo = {
  id: string;
  name: string;
  photo_url?: string | null;
};

type PlayerNameProps = {
  player: PlayerInfo;
  showInitialsText?: boolean;
  /**
   * Marks the avatar as decorative so it does not contribute to accessible
   * names when callers already provide surrounding labels.
   */
  decorativeAvatar?: boolean;
};

export default function PlayerName({
  player,
  showInitialsText = true,
  decorativeAvatar = false,
}: PlayerNameProps) {
  const photoUrl = normalizePhotoUrl(player.photo_url);
  const [showPhoto, setShowPhoto] = useState(Boolean(photoUrl));
  const initials = getInitials(player.name);

  useEffect(() => {
    setShowPhoto(Boolean(photoUrl));
  }, [photoUrl]);

  return (
    <span className="player-name">
      {photoUrl && showPhoto ? (
        <Image
          src={photoUrl}
          alt={decorativeAvatar ? "" : `${player.name} avatar`}
          aria-hidden={decorativeAvatar || undefined}
          width={24}
          height={24}
          sizes="24px"
          className="player-name__avatar"
          onError={() => setShowPhoto(false)}
        />
      ) : (
        <span
          role={decorativeAvatar ? "presentation" : "img"}
          aria-label={
            decorativeAvatar ? undefined : `${player.name} avatar placeholder`
          }
          aria-hidden={decorativeAvatar || undefined}
          className="player-name__avatar player-name__avatar--initials"
          data-initials={initials}
        >
          {showInitialsText ? initials : null}
        </span>
      )}
      <span className="player-name__text">{player.name}</span>
    </span>
  );
}
