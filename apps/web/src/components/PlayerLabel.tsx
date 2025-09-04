import Image from "next/image";

interface Props {
  id: string;
  name: string;
  photoUrl?: string | null;
}

export default function PlayerLabel({ id, name, photoUrl }: Props) {
  return (
    <span className="inline-flex items-center gap-2">
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt=""
          width={24}
          height={24}
          className="rounded-full object-cover"
        />
      ) : null}
      {name}
    </span>
  );
}
