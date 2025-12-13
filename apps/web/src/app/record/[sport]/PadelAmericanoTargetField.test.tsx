import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

import { PadelAmericanoTargetField } from "./PadelAmericanoTargetField";

describe("PadelAmericanoTargetField", () => {
  it("relays numeric changes", () => {
    const onChange = vi.fn();

    render(
      <PadelAmericanoTargetField
        value="16"
        onChange={onChange}
        label="Target"
        hint="Pick a target"
        targetHintId="target-hint"
      />,
    );

    fireEvent.change(screen.getByLabelText("Target"), { target: { value: "24" } });

    expect(onChange).toHaveBeenCalledWith("24");
  });
});
