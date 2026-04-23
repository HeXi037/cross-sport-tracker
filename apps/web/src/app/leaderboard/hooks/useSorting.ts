import { useCallback, useState } from "react";

export type SortDirection = "ascending" | "descending";

export type SortableColumn =
  | "player"
  | "sport"
  | "rating"
  | "winChance"
  | "wins"
  | "losses"
  | "matches"
  | "winPercent"
  | "highestScore"
  | "averageScore"
  | "standardDeviation";

export type SortCriterion = { column: SortableColumn; direction: SortDirection };

type AriaSort = "none" | SortDirection;

export function useSorting(defaultSort: SortCriterion[] = []) {
  const [sortState, setSortState] = useState<SortCriterion[]>(() => [...defaultSort]);

  const toggleSort = useCallback((column: SortableColumn, additive = false) => {
    setSortState((prev) => {
      const existingIndex = prev.findIndex((criterion) => criterion.column === column);
      const existing = existingIndex === -1 ? null : prev[existingIndex];

      if (!additive) {
        if (!existing) {
          return [{ column, direction: "descending" }];
        }
        if (existing.direction === "descending") {
          return [{ column, direction: "ascending" }];
        }
        return [];
      }

      if (!existing) {
        return [...prev, { column, direction: "descending" }];
      }

      if (existing.direction === "descending") {
        const next = [...prev];
        next[existingIndex] = { column, direction: "ascending" };
        return next;
      }

      return prev.filter((criterion) => criterion.column !== column);
    });
  }, []);

  const getSortForColumn = useCallback(
    (column: SortableColumn): SortDirection | undefined =>
      sortState.find((criterion) => criterion.column === column)?.direction,
    [sortState],
  );

  const getSortPriority = useCallback(
    (column: SortableColumn): number | null => {
      const index = sortState.findIndex((criterion) => criterion.column === column);
      return index === -1 ? null : index + 1;
    },
    [sortState],
  );

  const getAriaSort = useCallback(
    (column: SortableColumn): AriaSort => getSortForColumn(column) ?? "none",
    [getSortForColumn],
  );

  return {
    sortState,
    toggleSort,
    getSortForColumn,
    getSortPriority,
    getAriaSort,
  };
}
