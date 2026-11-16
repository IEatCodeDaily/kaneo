import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";

afterEach(cleanup);

describe("Select closed trigger labels", () => {
  it("shows the selected item's label before the menu is opened", () => {
    render(
      <Select
        items={[
          { value: "opaque-id", label: "Readable table" },
          { value: "other-id", label: "Another table" },
        ]}
        value="opaque-id"
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );

    expect(screen.getByRole("combobox")).toHaveTextContent("Readable table");
    expect(document.querySelector("[data-slot='select-popup']")).toBeNull();
  });
});
