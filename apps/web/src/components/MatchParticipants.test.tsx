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

  it("renders singles matches even when player metadata is sparse", () => {
    const { container } = render(
      <MatchParticipants
        className="text-sm"
        sides={[
          [{ id: "solo", name: "Solo Quinn", photo_url: null }],
          [{ id: "rival", name: "Riley Chen" }],
        ]}
      />
    );

    expect(screen.getByLabelText("versus")).toHaveTextContent("vs");
    expect(screen.queryByLabelText("and")).not.toBeInTheDocument();

    const decorativeAvatars = screen.getAllByRole("presentation", { hidden: true });
    expect(decorativeAvatars).toHaveLength(2);
    decorativeAvatars.forEach((avatar) => {
      expect(avatar).toHaveAttribute("aria-hidden", "true");
      expect(avatar).toHaveClass("player-name__avatar--initials");
    });

    expect(container.firstChild).toMatchInlineSnapshot(`
      <div
        class="match-participants text-sm"
      >
        <span
          class="match-participants__side-wrapper"
        >
          <span
            class="match-participants__side"
          >
            <span
              class="match-participants__entry"
            >
              <span
                class="player-name"
              >
                <span
                  aria-hidden="true"
                  class="player-name__avatar player-name__avatar--initials"
                  data-initials="SQ"
                  role="presentation"
                />
                <span
                  class="player-name__text"
                >
                  Solo Quinn
                </span>
              </span>
            </span>
          </span>
        </span>
        <span
          class="match-participants__side-wrapper"
        >
          <span
            aria-label="versus"
            class="match-participants__versus"
          >
             vs 
          </span>
          <span
            class="match-participants__side"
          >
            <span
              class="match-participants__entry"
            >
              <span
                class="player-name"
              >
                <span
                  aria-hidden="true"
                  class="player-name__avatar player-name__avatar--initials"
                  data-initials="RC"
                  role="presentation"
                />
                <span
                  class="player-name__text"
                >
                  Riley Chen
                </span>
              </span>
            </span>
          </span>
        </span>
      </div>
    `);
  });

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

  it("renders doubles pairings with accessible separators", () => {
    render(
      <MatchParticipants
        as="section"
        sides={[
          [
            { id: "a", name: "Alex Rivers", photo_url: "/photos/alex.png" },
            { id: "d", name: "Drew Lane" },
          ],
          [
            { id: "c", name: "Casey Hill" },
            { id: "e", name: "Ellis Kai", photo_url: "/photos/ellis.png" },
          ],
        ]}
      />
    );

    const separators = screen.getAllByLabelText("and");
    expect(separators.map((separator) => separator.textContent?.trim())).toEqual(["&", "&"]);

    const versus = screen.getByLabelText("versus");
    expect(versus).toHaveTextContent("vs");

    const condensed = document
      .querySelector(".match-participants")
      ?.textContent?.replace(/\s+/g, " ")
      .trim();
    expect(condensed).toBe("Alex Rivers & Drew Lane vs Casey Hill & Ellis Kai");
  });
});
