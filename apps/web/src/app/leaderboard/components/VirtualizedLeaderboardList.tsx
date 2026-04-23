import type { ComponentProps } from "react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import type { Leader } from "../hooks/useLeaderboardData";

export type LeaderboardListChildProps = ListChildComponentProps<Leader[]>;
type VirtualizedLeaderboardListProps = ComponentProps<typeof FixedSizeList<Leader[]>>;

export default function VirtualizedLeaderboardList(
  props: VirtualizedLeaderboardListProps,
) {
  return <FixedSizeList {...props} />;
}
