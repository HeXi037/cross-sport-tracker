export type PlayerInfo = {
  id: string;
  name: string;
  photo_url?: string | null;
};

export default function PlayerName({ player }: { player: PlayerInfo }) {
  return (
    <span className="player-name" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {player.photo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={player.photo_url}
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
