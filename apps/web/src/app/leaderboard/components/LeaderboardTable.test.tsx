import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { act } from "react";
import { ALL_SPORTS } from "../constants";
import type { Leader } from "../hooks/useLeaderboardData";
import LeaderboardTable from "./LeaderboardTable";

vi.mock("./VirtualizedLeaderboardList", () => ({
  default: ({
    children,
    itemData,
    itemCount,
    onItemsRendered,
  }: {
    children: (props: { index: number; style: React.CSSProperties; data: Leader[] }) => React.ReactNode;
    itemData: Leader[];
    itemCount: number;
    onItemsRendered?: (props: { visibleStartIndex: number; visibleStopIndex: number }) => void;
  }) => {
    onItemsRendered?.({
      visibleStartIndex: Math.max(0, itemCount - 5),
      visibleStopIndex: itemCount - 1,
    });
    return (
      <div role="rowgroup" data-testid="virtualized-rowgroup">
        {children({ index: 0, style: {}, data: itemData })}
      </div>
    );
  },
}));

const mockIntersectionObservers: MockIntersectionObserver[] = [];

class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  elements = new Set<Element>();
  observe = vi.fn((element: Element) => {
    this.elements.add(element);
  });
  disconnect = vi.fn();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    mockIntersectionObservers.push(this);
  }

  trigger(isIntersecting = true) {
    const entries = Array.from(this.elements).map((element) => ({
      isIntersecting,
      target: element,
      intersectionRatio: isIntersecting ? 1 : 0,
      time: 0,
      boundingClientRect: element.getBoundingClientRect(),
      intersectionRect: element.getBoundingClientRect(),
      rootBounds: null,
    })) as IntersectionObserverEntry[];
    this.callback(entries, this as unknown as IntersectionObserver);
  }
}

const makeLeader = (rank: number): Leader => ({
  rank,
  playerId: `player-${rank}`,
  playerName: `Player ${rank}`,
  rating: 1000 + rank,
  setsWon: rank,
  setsLost: 1,
});

const baseProps = {
  sport: ALL_SPORTS,
  isBowling: false,
  sortState: [],
  onSortChange: vi.fn(),
  getSortForColumn: vi.fn(),
  getSortPriority: vi.fn(),
  getAriaSort: vi.fn(() => "none" as const),
  captionText: "Leaderboard results",
  resultsTableId: "leaderboard-results",
  resultsTableCaptionId: "leaderboard-results-caption",
  formatSportName: vi.fn((value) => value ?? "Unknown"),
  formatInteger: vi.fn((value) => (value == null ? "—" : String(value))),
  formatRating: vi.fn((value) => (value == null ? "—" : String(value))),
  formatDecimal: vi.fn((value) => (value == null ? "—" : String(value))),
  formatWinProbability: vi.fn((value) => (value == null ? "—" : `${value}%`)),
  getWinProbability: vi.fn(() => null),
};

describe("LeaderboardTable virtualization", () => {
  beforeEach(() => {
    mockIntersectionObservers.length = 0;
    // @ts-expect-error test mock
    global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    // @ts-expect-error cleanup test mock
    delete global.IntersectionObserver;
    vi.clearAllMocks();
  });

  it("keeps small lists in the regular rowgroup and triggers loadMore with IntersectionObserver", async () => {
    const loadMore = vi.fn();

    render(
      <LeaderboardTable
        {...baseProps}
        leaders={Array.from({ length: 3 }, (_, i) => makeLeader(i + 1))}
        hasMore
        loadMore={loadMore}
      />,
    );

    const bodyRowgroup = screen
      .getAllByRole("rowgroup")
      .find((group) => group.querySelector('[role="row"]'));
    expect(bodyRowgroup).toBeInTheDocument();
    expect(screen.queryByTestId("virtualized-rowgroup")).not.toBeInTheDocument();

    await act(async () => {
      mockIntersectionObservers.forEach((observer) => observer.trigger());
    });

    expect(loadMore).toHaveBeenCalled();
  });

  it("renders large lists in the virtualized container and triggers loadMore from onItemsRendered", async () => {
    const loadMore = vi.fn();

    const { container } = render(
      <LeaderboardTable
        {...baseProps}
        leaders={Array.from({ length: 55 }, (_, i) => makeLeader(i + 1))}
        hasMore
        loadMore={loadMore}
      />,
    );

    const table = screen.getByRole("table");
    Object.defineProperty(table, "scrollWidth", {
      configurable: true,
      value: 1000,
    });
    table.getBoundingClientRect = () =>
      ({ width: 1000, height: 200, top: 0, left: 0, right: 1000, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("virtualized-rowgroup")).toBeInTheDocument();
    });
    expect(loadMore).toHaveBeenCalled();
    expect(
      container.querySelector('div[aria-hidden="true"][style*="height: 1px"]'),
    ).not.toBeInTheDocument();
  });
});
