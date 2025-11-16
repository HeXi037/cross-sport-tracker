import { normalizePhotoUrl } from '../lib/api';
import { getInitials } from '../lib/names';

export type PlayerInfo = {
  id: string;
  name: string;
  photo_url?: string | null;
};

export default function PlayerName({ player }: { player: PlayerInfo }) {
  const photoUrl = normalizePhotoUrl(player.photo_url);
  const initials = getInitials(player.name);
  const placeholderLabel = player.name.trim()
    ? `${player.name} avatar placeholder`
    : 'Player avatar placeholder';
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
          className="player-name__avatar player-name__avatar--initials"
          role="img"
          aria-label={placeholderLabel}
        >
          {initials}
        </span>
      )}
      {player.name}
    </span>
  );
}
