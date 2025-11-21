// apps/web/src/components/PlayerName.tsx (update)
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

  // Make the avatar decorative so it does not duplicate the player's name
  // in the accessible name or visible DOM text used by tests.
  return (
    <span className="player-name">
      {photoUrl ? (
        // Mark image as decorative - alt="" (no accessible name) and aria-hidden to
        // prevent it being included in the computed accessible name.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          aria-hidden="true"
          width={24}
          height={24}
          className="player-name__avatar"
        />
      ) : (
        // Initials are visual only — hide them from the accessibility tree and
        // render via CSS to keep them out of the DOM text content.
        <span
          className="player-name__avatar player-name__avatar--initials"
          aria-hidden="true"
          data-initials={initials}
        />
      )}
      <span className="player-name__text">{player.name}</span>
    </span>
  );
}
