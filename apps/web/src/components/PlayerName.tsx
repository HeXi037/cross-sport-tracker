import { ensureAbsoluteApiUrl } from '../lib/api';

export type PlayerInfo = {
  id: string;
  name: string;
  photo_url?: string | null;
};

export default function PlayerName({ player }: { player: PlayerInfo }) {
  const photoUrl =
    typeof player.photo_url === 'string' && player.photo_url
      ? ensureAbsoluteApiUrl(player.photo_url)
      : null;
  return (
    <span className="player-name">
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          width={24}
          height={24}
          className="player-name__avatar"
          aria-hidden="true"
          role="presentation"
        />
      )}
      {player.name}
    </span>
  );
}
