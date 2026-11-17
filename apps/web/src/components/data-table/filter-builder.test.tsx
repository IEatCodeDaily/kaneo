import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { DataTableField, FilterGroup } from "@/types/data-table";
import {
  conditionActive,
  emptyFilterGroup,
  FilterBuilder,
  filterConditions,
  pruneFilterGroup,
} from "./filter-builder";

vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
const field: DataTableField = {
  id: "f",
  tableId: "t",
  name: "Name",
  type: "text",
  options: null,
  position: 0,
  createdAt: "",
  updatedAt: "",
};
describe("filter builder", () => {
  it("counts zero, false and blank text as values, not drafts; prunes recursively without flattening OR", () => {
    const group: FilterGroup = {
      conjunction: "and",
      children: [
        {
          conjunction: "or",
          children: [
            { fieldId: "f", op: "eq", value: "" },
            { fieldId: "n", op: "eq", value: 0 },
            { fieldId: "b", op: "eq", value: false },
            { fieldId: "draft", op: "eq" },
          ],
        },
        { fieldId: "empty", op: "isEmpty" },
      ],
    };
    const active = pruneFilterGroup(group, conditionActive);
    expect(filterConditions(active)).toHaveLength(4);
    expect(active.children[0]).toMatchObject({
      conjunction: "or",
      children: expect.any(Array),
    });
    const pruned = pruneFilterGroup(
      active,
      (condition) => condition.fieldId === "empty",
    );
    expect(pruned.children).toEqual([{ fieldId: "empty", op: "isEmpty" }]);
    expect(JSON.parse(JSON.stringify(group))).toEqual(group);
  });
  it("adds/removes conditions and groups and clears the entire document", () => {
    function Harness() {
      const [filters, setFilters] = useState(emptyFilterGroup);
      return (
        <FilterBuilder
          fields={[field]}
          members={new Map()}
          filters={filters}
          onFiltersChange={setFilters}
        />
      );
    }
    const { container } = render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "navigation:tables.addFilter" }),
    );
    expect(container.querySelectorAll("[data-filter-condition]")).toHaveLength(
      1,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "navigation:tables.addFilterGroup" }),
    );
    expect(container.querySelectorAll("[data-filter-group]")).toHaveLength(2);
    fireEvent.click(
      screen.getByRole("button", { name: "navigation:tables.removeFilter" }),
    );
    expect(container.querySelectorAll("[data-filter-condition]")).toHaveLength(
      0,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "navigation:tables.removeGroup" }),
    );
    expect(container.querySelectorAll("[data-filter-group]")).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "navigation:tables.addFilter" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "navigation:tables.clearFilters" }),
    );
    expect(container.querySelectorAll("[data-filter-condition]")).toHaveLength(
      0,
    );
  });
});
