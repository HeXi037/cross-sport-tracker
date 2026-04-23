import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSorting } from "./useSorting";

describe("useSorting", () => {
  it("cycles unsorted -> descending -> ascending -> cleared", () => {
    const { result } = renderHook(() => useSorting());

    expect(result.current.sortState).toEqual([]);

    act(() => {
      result.current.toggleSort("rating");
    });
    expect(result.current.sortState).toEqual([
      { column: "rating", direction: "descending" },
    ]);
    expect(result.current.getSortForColumn("rating")).toBe("descending");
    expect(result.current.getSortPriority("rating")).toBe(1);
    expect(result.current.getAriaSort("rating")).toBe("descending");

    act(() => {
      result.current.toggleSort("rating");
    });
    expect(result.current.sortState).toEqual([
      { column: "rating", direction: "ascending" },
    ]);
    expect(result.current.getSortForColumn("rating")).toBe("ascending");
    expect(result.current.getAriaSort("rating")).toBe("ascending");

    act(() => {
      result.current.toggleSort("rating");
    });
    expect(result.current.sortState).toEqual([]);
    expect(result.current.getSortForColumn("rating")).toBeUndefined();
    expect(result.current.getSortPriority("rating")).toBeNull();
    expect(result.current.getAriaSort("rating")).toBe("none");
  });

  it("supports additive multi-column sorting transitions", () => {
    const { result } = renderHook(() => useSorting());

    act(() => {
      result.current.toggleSort("rating", true);
      result.current.toggleSort("player", true);
    });

    expect(result.current.sortState).toEqual([
      { column: "rating", direction: "descending" },
      { column: "player", direction: "descending" },
    ]);
    expect(result.current.getSortPriority("rating")).toBe(1);
    expect(result.current.getSortPriority("player")).toBe(2);

    act(() => {
      result.current.toggleSort("rating", true);
    });
    expect(result.current.sortState).toEqual([
      { column: "rating", direction: "ascending" },
      { column: "player", direction: "descending" },
    ]);

    act(() => {
      result.current.toggleSort("rating", true);
    });
    expect(result.current.sortState).toEqual([
      { column: "player", direction: "descending" },
    ]);
    expect(result.current.getSortPriority("rating")).toBeNull();
    expect(result.current.getSortPriority("player")).toBe(1);
  });
});
