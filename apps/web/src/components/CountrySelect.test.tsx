import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CountrySelect from "./filters/CountrySelect";

describe("CountrySelect", () => {
  it("filters options by country name and code", async () => {
    render(<CountrySelect value="" onChange={() => {}} />);

    const user = userEvent.setup();
    const input = screen.getByRole("combobox");

    await user.type(input, "swed");
    expect(await screen.findByRole("option", { name: /Sweden \(SE\)/i })).toBeVisible();

    await user.clear(input);
    await user.type(input, "us");
    expect(await screen.findByRole("option", { name: /United States of America \(US\)/i })).toBeVisible();
  });

  it("supports keyboard navigation and enter to select", async () => {
    const handleChange = vi.fn();
    render(<CountrySelect value="" onChange={handleChange} />);

    const user = userEvent.setup();
    const input = screen.getByRole("combobox");

    await user.type(input, "swed");
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(handleChange).toHaveBeenCalledWith("SE");
  });

  it("closes suggestions on escape", async () => {
    render(<CountrySelect value="" onChange={() => {}} />);

    const user = userEvent.setup();
    const input = screen.getByRole("combobox");

    await user.type(input, "can");
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });


  it("supports custom options", async () => {
    const handleChange = vi.fn();
    render(
      <CountrySelect
        value=""
        onChange={handleChange}
        options={[
          { code: "XX", name: "Exampleland", continent: "EU" },
          { code: "YY", name: "Testonia", continent: "EU" },
        ]}
      />
    );

    const user = userEvent.setup();
    const input = screen.getByRole("combobox");

    await user.type(input, "example");
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(handleChange).toHaveBeenCalledWith("XX");
  });

  it("preserves empty option equivalent for clearing", async () => {
    const handleChange = vi.fn();
    render(<CountrySelect value="US" onChange={handleChange} />);

    const user = userEvent.setup();
    const input = screen.getByRole("combobox");

    await user.click(input);
    await user.keyboard("{ArrowDown}{Enter}");

    expect(handleChange).toHaveBeenCalledWith("");
  });
});
