import { describe, expect, it } from "vitest";
import { normalizeWhitespace, resolveText } from "./text";

describe("text helpers", () => {
  it("normalizes whitespace sequences", () => {
    expect(normalizeWhitespace("  A   B\tC  ")).toBe("A B C");
  });

  it("falls back when value is not a usable string", () => {
    expect(resolveText(undefined, "fallback")).toBe("fallback");
    expect(resolveText("   ", "fallback")).toBe("fallback");
  });

  it("returns trimmed text when available", () => {
    expect(resolveText("  Hello  ", "fallback")).toBe("Hello");
  });
});
