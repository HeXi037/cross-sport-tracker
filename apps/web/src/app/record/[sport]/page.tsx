// apps/web/src/app/record/[sport]/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

interface Player {
  id: string;
  name: string;
  club_id?: string | null;
}

export default function RecordSportPage() {
  const router = useRouter();
  const params = useParams();
  const sport = typeof params.sport === "string" ? params.sport : "";
  const isPadel = sport === "padel";
  const isTennis = sport === "tennis";
  const isPickleball = sport === "pickleball";
  const usesSets = isPadel || isTennis;

  const [players, setPlayers] = useState<Player[]>([]);
  the rest continues—you will now follow the previously provided final file content up to the end.
}
