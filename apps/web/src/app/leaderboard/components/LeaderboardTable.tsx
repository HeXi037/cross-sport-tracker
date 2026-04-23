import {
  CSSProperties,
  Suspense,
  forwardRef,
  HTMLAttributes,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ALL_SPORTS, type LeaderboardSport } from "../constants";
import type { Leader } from "../hooks/useLeaderboardData";
import type { LeaderboardListChildProps } from "./VirtualizedLeaderboardList";
import type {
  SortCriterion,
  SortDirection,
  SortableColumn,
} from "../hooks/useSorting";
import { selectLeaderDerivedMetrics } from "../lib/leaderboardMetrics";

const VIRTUALIZATION_THRESHOLD = 50;
const VIRTUAL_ROW_HEIGHT = 40;
const MAX_VIRTUALIZED_HEIGHT = 520;

const VirtualizedLeaderboardList = lazy(() => import("./VirtualizedLeaderboardList"));

type Props = {
  leaders: Leader[];
  sport: LeaderboardSport;
  isBowling: boolean;
  sortState: SortCriterion[];
  onSortChange: (column: SortableColumn, additive: boolean) => void;
  getSortForColumn: (column: SortableColumn) => SortDirection | undefined;
  getSortPriority: (column: SortableColumn) => number | null;
  getAriaSort: (column: SortableColumn) => "none" | SortDirection;
  captionText: string;
  resultsTableId: string;
  resultsTableCaptionId: string;
  formatSportName: (sportId: string | null | undefined) => string;
  formatInteger: (value?: number | null) => string;
  formatRating: (value?: number | null) => string;
  formatDecimal: (value?: number | null) => string;
  formatWinProbability: (value: number | null) => string;
  getWinProbability: (leader: Leader) => number | null;
  hasMore: boolean;
  loadMore: () => void;
};

export default function LeaderboardTable({
  leaders,
  sport,
  isBowling,
  sortState,
  onSortChange,
  getSortForColumn,
  getSortPriority,
  getAriaSort,
  captionText,
  resultsTableId,
  resultsTableCaptionId,
  formatSportName,
  formatInteger,
  formatRating,
  formatDecimal,
  formatWinProbability,
  getWinProbability,
  hasMore,
  loadMore,
}: Props) {
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [tableWidth, setTableWidth] = useState(0);

  const tableStyle = useMemo(
    () => ({
      width: "100%",
      display: "grid",
      fontSize: "0.9rem",
    }),
    [],
  );

  const columnTemplate = useMemo(() => {
    const columns: string[] = ["56px", "minmax(160px, 1.6fr)"];
    if (sport === ALL_SPORTS) {
      columns.push("minmax(120px, 1fr)");
    }
    columns.push("minmax(90px, 0.7fr)", "minmax(150px, 1fr)");
    if (isBowling) {
      columns.push(
        "minmax(120px, 0.9fr)",
        "minmax(120px, 0.9fr)",
        "minmax(140px, 1fr)",
        "minmax(180px, 1fr)",
      );
    } else {
      columns.push("72px", "72px", "96px", "72px");
    }
    return columns.join(" ");
  }, [isBowling, sport]);

  const headerRowStyle = useMemo(
    () => ({
      display: "grid",
      gridTemplateColumns: columnTemplate,
      alignItems: "center",
    }),
    [columnTemplate],
  );

  const rowGridStyle = useMemo(
    () => ({
      display: "grid",
      gridTemplateColumns: columnTemplate,
      alignItems: "center",
      borderTop: "1px solid var(--color-border-subtle)",
      boxSizing: "border-box" as const,
      height: VIRTUAL_ROW_HEIGHT,
    }),
    [columnTemplate],
  );

  const VirtualRowGroup = useMemo(() => {
    const Component = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
      (props, ref) => <div ref={ref} role="rowgroup" {...props} />,
    );
    Component.displayName = "VirtualRowGroup";
    return Component;
  }, []);

  const headerCellStyle = useMemo(
    () => ({
      position: "sticky" as const,
      top: 0,
      zIndex: 1,
      textAlign: "left" as const,
      padding: "4px 16px 4px 0",
      background: "var(--leaderboard-table-header-bg)",
      whiteSpace: "nowrap" as const,
    }),
    [],
  );
  const lastHeaderCellStyle = useMemo(
    () => ({ ...headerCellStyle, padding: "4px 0" }),
    [headerCellStyle],
  );
  const cellStyle = useMemo(() => ({ padding: "4px 16px 4px 0" }), []);
  const lastCellStyle = useMemo(() => ({ padding: "4px 0" }), []);

  const renderSortableHeader = useCallback(
    (
      column: SortableColumn,
      label: string,
      style: CSSProperties,
      useNativeElements: boolean,
    ) => {
      const direction = getSortForColumn(column);
      const isSorted = direction !== undefined;
      const ariaSort = getAriaSort(column);
      const sortPriority = getSortPriority(column);
      const actionHint =
        direction === "ascending"
          ? "Currently sorted ascending. Click to clear this sort."
          : direction === "descending"
            ? "Currently sorted descending. Click to sort ascending."
            : "Not sorted. Click to sort descending.";
      const shiftHint =
        " Hold Shift while clicking to add or update this column in multi-column sorting.";
      const ColumnElement = useNativeElements ? "th" : "div";
      const columnProps = useNativeElements
        ? { "aria-sort": ariaSort, scope: "col" as const }
        : { role: "columnheader", "aria-sort": ariaSort };
      return (
        <ColumnElement
          {...columnProps}
          style={style}
          className={isSorted ? "leaderboard-sortable-header-cell--active" : undefined}
        >
          <button
            type="button"
            onClick={(event) => onSortChange(column, event.shiftKey)}
            aria-label={`${label}. ${actionHint}${shiftHint}`}
            className={`leaderboard-sortable-header-button${
              isSorted ? " leaderboard-sortable-header-button--active" : ""
            }`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.2rem 0.45rem",
              margin: 0,
              border: "none",
              borderRadius: "0.45rem",
              background: "transparent",
              color: isSorted
                ? "var(--color-text-strong, var(--color-text))"
                : "inherit",
              font: "inherit",
              cursor: "pointer",
              fontWeight: isSorted ? 700 : 500,
            }}
          >
            <span>{label}</span>
            {sortPriority != null ? (
              <span
                aria-hidden="true"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: "1.1rem",
                  height: "1.1rem",
                  borderRadius: "999px",
                  background:
                    "color-mix(in srgb, var(--color-accent-blue) 25%, transparent)",
                  fontSize: "0.72em",
                  lineHeight: 1,
                }}
              >
                {sortPriority}
              </span>
            ) : null}
            <span
              className={`leaderboard-sortable-header-icon${
                isSorted ? " leaderboard-sortable-header-icon--active" : ""
              }`}
              aria-hidden="true"
              style={{
                fontSize: isSorted ? "1.08em" : "0.98em",
                fontWeight: isSorted ? 800 : 600,
                opacity: isSorted ? 1 : 0.92,
              }}
            >
              {direction === "ascending"
                ? "▲"
                : direction === "descending"
                  ? "▼"
                  : "↕"}
            </span>
          </button>
        </ColumnElement>
      );
    },
    [getAriaSort, getSortForColumn, getSortPriority, onSortChange],
  );

  const TableHeader = ({ useNativeElements = false }: { useNativeElements?: boolean }) => {
    const GroupElement = useNativeElements ? "thead" : "div";
    const RowElement = useNativeElements ? "tr" : "div";
    const ColumnElement = useNativeElements ? "th" : "div";
    const groupProps = useNativeElements ? {} : { role: "rowgroup" };
    const rowProps = useNativeElements ? {} : { role: "row" };
    const columnHeaderProps = useNativeElements
      ? { scope: "col" as const }
      : { role: "columnheader" };
    return (
      <GroupElement {...groupProps}>
        <RowElement {...rowProps} style={headerRowStyle}>
          <ColumnElement
            {...columnHeaderProps}
            aria-sort={sortState.length > 0 ? "none" : "ascending"}
            style={headerCellStyle}
          >
            #
          </ColumnElement>
          {renderSortableHeader("player", "Player", headerCellStyle, useNativeElements)}
          {sport === ALL_SPORTS
            ? renderSortableHeader("sport", "Sport", headerCellStyle, useNativeElements)
            : null}
          {renderSortableHeader("rating", "Rating", headerCellStyle, useNativeElements)}
          {renderSortableHeader(
            "winChance",
            "Win chance vs #1",
            headerCellStyle,
            useNativeElements,
          )}
          {isBowling ? (
            <>
              {renderSortableHeader(
                "highestScore",
                "Highest score",
                headerCellStyle,
                useNativeElements,
              )}
              {renderSortableHeader(
                "averageScore",
                "Average score",
                headerCellStyle,
                useNativeElements,
              )}
              {renderSortableHeader(
                "matches",
                "Matches played",
                headerCellStyle,
                useNativeElements,
              )}
              {renderSortableHeader(
                "standardDeviation",
                "Std. deviation (consistency)",
                lastHeaderCellStyle,
                useNativeElements,
              )}
            </>
          ) : (
            <>
              {renderSortableHeader("wins", "W", headerCellStyle, useNativeElements)}
              {renderSortableHeader("losses", "L", headerCellStyle, useNativeElements)}
              {renderSortableHeader(
                "matches",
                "Matches",
                headerCellStyle,
                useNativeElements,
              )}
              {renderSortableHeader(
                "winPercent",
                "Win%",
                lastHeaderCellStyle,
                useNativeElements,
              )}
            </>
          )}
        </RowElement>
      </GroupElement>
    );
  };

  useEffect(() => {
    const element = tableContainerRef.current;
    if (!element) {
      return;
    }
    const updateWidth = () => {
      const rectWidth = element.getBoundingClientRect().width;
      const scrollWidth = element.scrollWidth;
      setTableWidth(Math.max(rectWidth, scrollWidth));
    };
    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }
    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(element);
    return () => observer.disconnect();
  }, [leaders.length]);

  const shouldVirtualize = leaders.length > VIRTUALIZATION_THRESHOLD && tableWidth > 0;
  const virtualizedListHeight = useMemo(
    () => Math.min(leaders.length * VIRTUAL_ROW_HEIGHT, MAX_VIRTUALIZED_HEIGHT),
    [leaders.length],
  );

  const buildRow = useCallback(
    (row: Leader, index: number, style?: CSSProperties) => {
      const derivedMetrics = selectLeaderDerivedMetrics(row);
      const winPct = !isBowling ? derivedMetrics.winPercentage : null;
      const rowKey = `${row.rank}-${row.playerId}-${row.sport ?? ""}`;
      return (
        <div
          key={rowKey}
          role="row"
          style={{
            ...rowGridStyle,
            ...(style ?? {}),
            width: "100%",
            background:
              index % 2 === 1 ? "rgba(10, 31, 68, 0.02)" : "transparent",
          }}
        >
          <div role="cell" style={cellStyle}>
            {sortState.length > 0 ? index + 1 : row.rank}
          </div>
          <div role="cell" style={cellStyle}>
            {row.playerName}
          </div>
          {sport === ALL_SPORTS ? (
            <div role="cell" style={cellStyle}>
              {formatSportName(row.sport)}
            </div>
          ) : null}
          <div
            role="cell"
            style={cellStyle}
            title={row.rating != null ? row.rating.toString() : undefined}
          >
            {formatRating(row.rating)}
          </div>
          <div role="cell" style={cellStyle}>
            {formatWinProbability(getWinProbability(row))}
          </div>
          {isBowling ? (
            <>
              <div role="cell" style={cellStyle}>
                {formatInteger(row.highestScore ?? null)}
              </div>
              <div role="cell" style={cellStyle}>
                {formatDecimal(row.averageScore ?? null)}
              </div>
              <div role="cell" style={cellStyle}>
                {formatInteger(derivedMetrics.bowlingMatchesPlayed)}
              </div>
              <div role="cell" style={lastCellStyle}>
                {formatDecimal(row.standardDeviation ?? null)}
              </div>
            </>
          ) : (
            <>
              <div role="cell" style={cellStyle}>
                {row.setsWon ?? "—"}
              </div>
              <div role="cell" style={cellStyle}>
                {row.setsLost ?? "—"}
              </div>
              <div role="cell" style={cellStyle}>
                {derivedMetrics.matchesTotal || "—"}
              </div>
              <div role="cell" style={lastCellStyle}>
                {winPct != null ? `${Math.round(winPct)}%` : "—"}
              </div>
            </>
          )}
        </div>
      );
    },
    [
      cellStyle,
      formatDecimal,
      formatInteger,
      formatRating,
      formatSportName,
      formatWinProbability,
      getWinProbability,
      isBowling,
      lastCellStyle,
      rowGridStyle,
      sortState.length,
      sport,
    ],
  );

  const renderVirtualRow = useCallback(
    ({ index, style, data }: LeaderboardListChildProps) =>
      buildRow(data[index], index, style),
    [buildRow],
  );

  const handleItemsRendered = useCallback(
    ({ visibleStopIndex }: { visibleStartIndex: number; visibleStopIndex: number }) => {
      if (hasMore && visibleStopIndex >= leaders.length - 5) {
        loadMore();
      }
    },
    [hasMore, leaders.length, loadMore],
  );

  useEffect(() => {
    if (!hasMore || shouldVirtualize) {
      return;
    }
    const target = loadMoreRef.current;
    if (!target) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          loadMore();
        }
      });
    }, { rootMargin: "200px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, leaders.length, loadMore, shouldVirtualize]);

  return (
    <div className="leaderboard-table-wrapper">
      <div
        id={resultsTableId}
        ref={tableContainerRef}
        role="table"
        className="leaderboard-table"
        style={tableStyle}
        aria-labelledby={resultsTableCaptionId}
      >
        <div id={resultsTableCaptionId} className="sr-only">
          {captionText}
        </div>
        <TableHeader />
        {shouldVirtualize ? (
          <Suspense fallback={null}>
            <VirtualizedLeaderboardList
              height={virtualizedListHeight}
              width={tableWidth}
              itemCount={leaders.length}
              itemData={leaders}
              itemSize={VIRTUAL_ROW_HEIGHT}
              onItemsRendered={handleItemsRendered}
              outerElementType={VirtualRowGroup}
              itemKey={(index, data) => {
                const row = data[index];
                return `${row.rank}-${row.playerId}-${row.sport ?? ""}`;
              }}
              style={{ overflowX: "hidden" }}
            >
              {renderVirtualRow}
            </VirtualizedLeaderboardList>
          </Suspense>
        ) : (
          <div role="rowgroup">
            {leaders.map((row, index) => buildRow(row, index))}
          </div>
        )}
      </div>
      {hasMore && !shouldVirtualize ? (
        <div ref={loadMoreRef} aria-hidden="true" style={{ width: "100%", height: "1px" }} />
      ) : null}
    </div>
  );
}
