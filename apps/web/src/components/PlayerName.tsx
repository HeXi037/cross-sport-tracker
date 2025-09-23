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
    <span className="player-name" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={player.name}
          width={24}
          height={24}
          style={{ borderRadius: '50%', objectFit: 'cover' }}
        />
      )}
      {player.name}
    </span>
  );
}
