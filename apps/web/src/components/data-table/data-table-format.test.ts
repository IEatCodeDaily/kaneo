import { beforeEach, describe, expect, it } from "vitest";
import type { DataTableField } from "@/types/data-table";
import {
  currencyUnit,
  filterIsActive,
  readHiddenFields,
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
    const unit = currencyUnit(field({ type: "currency", options: { code: "USD" } }));
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
