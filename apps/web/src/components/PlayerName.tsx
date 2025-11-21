// apps/web/src/components/PlayerName.tsx (update)
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
};

export default function PlayerName({
  player,
  showInitialsText = true,
}: PlayerNameProps) {
  const photoUrl = normalizePhotoUrl(player.photo_url);
  const initials = getInitials(player.name);

  return (
    <span className="player-name">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={`${player.name} avatar`}
          width={24}
          height={24}
          className="player-name__avatar"
        />
      ) : (
        <span
          role="img"
          aria-label={`${player.name} avatar placeholder`}
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
