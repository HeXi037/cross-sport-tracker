import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import MatchParticipants from "./MatchParticipants";

describe("MatchParticipants", () => {
  const sides = [
    [
      { id: "p1", name: "Ann" },
      { id: "p2", name: "Bob" },
    ],
    [{ id: "p3", name: "Cam" }],
  ];

  it("normalizes whitespace for custom separators", () => {
    render(
      <MatchParticipants
        as="h2"
        sides={sides}
        separatorSymbol="  &  "
        separatorLabel="  crew  "
        versusSymbol="  VS  "
        versusLabel=" showdown "
      />
    );

    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("Ann & Bob VS Cam");
    expect(heading).not.toHaveTextContent(/VS\s+VS/);
    expect(heading).toHaveAccessibleName("Ann crew Bob showdown Cam");

    const separator = screen.getByLabelText("crew");
    expect(separator.textContent?.trim()).toBe("&");

    const versus = screen.getByLabelText("showdown");
    expect(versus.textContent?.trim()).toBe("VS");
  });

  it("falls back to defaults when symbols are blank", () => {
    render(
      <MatchParticipants as="h3" sides={sides} separatorSymbol="  " versusSymbol="  " />
    );

    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.textContent?.replace(/\s+/g, " ")).toBe("Ann & Bob vs Cam");
    expect(heading).toHaveAccessibleName("Ann and Bob versus Cam");

    const separator = screen.getByLabelText("and");
    expect(separator.textContent?.trim()).toBe("&");

    const versus = screen.getByLabelText("versus");
    expect(versus.textContent?.trim()).toBe("vs");
  });
});
