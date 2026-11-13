import { beforeEach, describe, expect, it } from "vitest";
import type { DataTableField } from "@/types/data-table";
import type { DataTableRow } from "@/types/data-table";
import {
  currencyUnit,
  filterIsActive,
  groupRows,
  groupValue,
  readHiddenFields,
  summarize,
  writeHiddenFields,
} from "./data-table-format";

const field = (over: Partial<DataTableField>): DataTableField => ({
  id: "f1",
  tableId: "t",
  name: "Field",
  type: "text",
  options: null,
  position: 0,
  createdAt: "",
  updatedAt: "",
  ...over,
});

describe("filterIsActive", () => {
  it("text filters need a non-blank value", () => {
    expect(filterIsActive({ id: "1", fieldId: "f", contains: "" })).toBe(false);
    expect(filterIsActive({ id: "1", fieldId: "f", contains: "  " })).toBe(
      false,
    );
    expect(filterIsActive({ id: "1", fieldId: "f", contains: "pb" })).toBe(
      true,
    );
  });

  it("range filters need min or max", () => {
    expect(filterIsActive({ id: "1", fieldId: "f", min: "", max: "" })).toBe(
      false,
    );
    expect(filterIsActive({ id: "1", fieldId: "f", min: "1", max: "" })).toBe(
      true,
    );
    expect(
      filterIsActive({ id: "1", fieldId: "f", from: "", to: "2026-01-01" }),
    ).toBe(true);
  });

  it("checkbox 'any' is inert, a choice is only active once picked", () => {
    expect(filterIsActive({ id: "1", fieldId: "f", checked: "any" })).toBe(
      false,
    );
    expect(filterIsActive({ id: "1", fieldId: "f", checked: "true" })).toBe(
      true,
    );
    expect(filterIsActive({ id: "1", fieldId: "f", choiceId: "" })).toBe(false);
    expect(filterIsActive({ id: "1", fieldId: "f", choiceId: "c1" })).toBe(
      true,
    );
  });
});

describe("currencyUnit", () => {
  it("returns the narrow symbol for known codes", () => {
    const unit = currencyUnit(
      field({ type: "currency", options: { code: "USD" } }),
    );
    expect(unit).toBeTypeOf("string");
    expect(unit?.length).toBeGreaterThan(0);
    expect(unit).not.toBe("USD");
  });

  it("falls back to the raw code when Intl rejects it, and null for non-currency", () => {
    expect(
      currencyUnit(field({ type: "currency", options: { code: "XX" } })),
    ).toBe("XX");
    expect(currencyUnit(field({ type: "text" }))).toBeNull();
  });
});

describe("hidden fields", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips per table", () => {
    writeHiddenFields("t1", ["a", "b"]);
    expect(readHiddenFields("t1")).toEqual(["a", "b"]);
    expect(readHiddenFields("t2")).toEqual([]);
  });

  it("survives corrupt storage", () => {
    localStorage.setItem("kaneo-table-hidden:t1", "{not json");
    expect(readHiddenFields("t1")).toEqual([]);
  });
});

// ── S3: grouping + summaries ───────────────────────────────────────────────

const row = (id: string, values: Record<string, unknown>): DataTableRow => ({
  id,
  position: 0,
  values,
  createdAt: "",
  updatedAt: "",
});

const selectField = field({
  id: "stage",
  type: "select",
  options: { choices: [{ id: "c1", label: "Mixing", color: "#fff" }] },
});

describe("groupRows", () => {
  it("buckets rows, empty values last", () => {
    const groups = groupRows(selectField, [
      row("r1", { stage: "c1" }),
      row("r2", { stage: "c1" }),
      row("r3", {}),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["c1", ""]);
    expect(groups[0].rows.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(groups[1].rows.map((r) => r.id)).toEqual(["r3"]);
  });

  it("checkbox buckets normalise to true/false strings", () => {
    const groups = groupRows(field({ id: "d", type: "checkbox" }), [
      row("r1", { d: true }),
      row("r2", { d: false }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["false", "true"]);
  });

  it("groupValue presets a new row's cell", () => {
    expect(groupValue(selectField, "c1")).toBe("c1");
    expect(groupValue(selectField, "")).toBeNull();
    expect(groupValue(field({ id: "d", type: "checkbox" }), "true")).toBe(true);
    expect(groupValue(field({ id: "n", type: "number" }), "42")).toBe(42);
  });
});

describe("summarize", () => {
  it("sums numeric columns", () => {
    const rows = [row("a", { c: 2 }), row("b", { c: 3 }), row("x", { c: null })];
    expect(summarize("sum", field({ id: "c", type: "number" }), rows)).toBe(
      "5",
    );
    expect(summarize("avg", field({ id: "c", type: "number" }), rows)).toBe(
      "2.5",
    );
  });

  it("counts filled and checked", () => {
    const rows = [
      row("a", { n: "x" }),
      row("b", { n: "" }),
      row("c", { d: true }),
    ];
    expect(summarize("filled", field({ id: "n", type: "text" }), rows)).toBe(
      "1/3",
    );
    expect(summarize("checked", field({ id: "d", type: "checkbox" }), rows)).toBe(
      "1/3",
    );
  });

  it("is null when off or nothing matches", () => {
    expect(summarize("none", field({}), [row("a", {})])).toBeNull();
    expect(summarize("sum", field({ id: "c", type: "number" }), [])).toBeNull();
  });
});
