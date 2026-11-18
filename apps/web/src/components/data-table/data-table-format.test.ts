import { beforeEach, describe, expect, it } from "vitest";
import type { DataTableField, DataTableRow } from "@/types/data-table";
import {
  currencyUnit,
  DENSITY_LABEL_KEYS,
  DENSITY_ROW_HEIGHT,
  DENSITY_WRAP_LINES,
  fieldValue,
  filterIsActive,
  groupRows,
  groupValue,
  isValidNumberInput,
  readDensity,
  readFrozenColumns,
  readHiddenFields,
  readShowSystemFields,
  rowMatchesFilters,
  sortRows,
  summarize,
  summaryOptions,
  systemFields,
  typeChangeKeepsValues,
  writeDensity,
  writeFrozenColumns,
  writeHiddenFields,
  writeShowSystemFields,
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

describe("frozen columns", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a frozen count per table", () => {
    writeFrozenColumns("t1", 2);
    expect(readFrozenColumns("t1")).toBe(2);
    expect(readFrozenColumns("t2")).toBe(0);
  });

  it("falls back to none on corrupt or nonsensical storage", () => {
    localStorage.setItem("kaneo-table-frozen:t1", "{not json");
    expect(readFrozenColumns("t1")).toBe(0);
    localStorage.setItem("kaneo-table-frozen:t1", "-3");
    expect(readFrozenColumns("t1")).toBe(0);
    localStorage.setItem("kaneo-table-frozen:t1", "1.5");
    expect(readFrozenColumns("t1")).toBe(0);
    localStorage.setItem("kaneo-table-frozen:t1", '"2"');
    expect(readFrozenColumns("t1")).toBe(0);
  });
});

describe("row height (density)", () => {
  beforeEach(() => localStorage.clear());

  it("offers the four NocoDB heights, tall+ wrap long text", () => {
    expect(Object.keys(DENSITY_ROW_HEIGHT)).toEqual([
      "compact",
      "comfortable",
      "tall",
      "extra",
    ]);
    expect(DENSITY_ROW_HEIGHT.tall).toBeGreaterThan(
      DENSITY_ROW_HEIGHT.comfortable,
    );
    expect(DENSITY_ROW_HEIGHT.extra).toBeGreaterThan(DENSITY_ROW_HEIGHT.tall);
    expect(DENSITY_WRAP_LINES.tall).toBeGreaterThan(1);
    expect(DENSITY_WRAP_LINES.extra).toBeGreaterThan(
      DENSITY_WRAP_LINES.tall ?? 0,
    );
    for (const key of Object.keys(DENSITY_ROW_HEIGHT))
      expect(
        DENSITY_LABEL_KEYS[key as keyof typeof DENSITY_ROW_HEIGHT],
      ).toMatch(/^navigation:tables\.density/);
  });

  it("persists per table and defaults to short", () => {
    writeDensity("t1", "tall");
    writeDensity("t2", "extra");
    expect(readDensity("t1")).toBe("tall");
    expect(readDensity("t2")).toBe("extra");
    expect(readDensity("t3")).toBe("compact");
  });

  it("carries over the old browser-wide preference, ignores junk", () => {
    localStorage.setItem("kaneo-table-density", "comfortable");
    expect(readDensity("t1")).toBe("comfortable");
    writeDensity("t1", "compact");
    expect(readDensity("t2")).toBe("comfortable");
    localStorage.setItem("kaneo-table-density:t1", "gigantic");
    expect(readDensity("t1")).toBe("comfortable");
  });
});

describe("virtual system fields", () => {
  const fields = systemFields("t", (key) => key);
  const byId = new Map(fields.map((field) => [field.id, field]));
  const row: DataTableRow = {
    id: "opaque-row-id",
    position: 8,
    createdAt: "2026-11-10T12:00:00Z",
    updatedAt: "2026-11-11T13:00:00Z",
    createdBy: "creator",
    updatedBy: "editor",
    values: { __row_id: "spoofed" },
  };
  it("projects immutable metadata, not editable values or raw row ids", () => {
    expect(fields.map((field) => field.system)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(fields.map((field) => fieldValue(row, field))).toEqual([
      9,
      row.createdAt,
      row.updatedAt,
      "creator",
      "editor",
    ]);
    const field = byId.get("__created_by");
    if (!field) throw new Error("missing __created_by field config");
    expect(fieldValue({ ...row, createdBy: undefined }, field)).toBeNull();
  });
  it("reuses date/user filters and date/number sorts", () => {
    const later = {
      ...row,
      id: "later",
      position: 10,
      createdAt: "2026-11-12T00:00:00Z",
    };
    expect(
      sortRows([later, row], fields, { fieldId: "__created_at", dir: "asc" }),
    ).toEqual([row, later]);
    expect(
      sortRows([row, later], fields, { fieldId: "__row_id", dir: "desc" }),
    ).toEqual([later, row]);
    expect(
      rowMatchesFilters(row, byId, [
        {
          id: "f",
          fieldId: "__created_at",
          from: "2026-11-10",
          to: "2026-11-10",
        },
      ]),
    ).toBe(true);
    expect(
      rowMatchesFilters(row, byId, [
        { id: "f", fieldId: "__created_by", choiceId: "creator" },
      ]),
    ).toBe(true);
    expect(
      rowMatchesFilters(row, byId, [
        { id: "f", fieldId: "__updated_by", choiceId: "creator" },
      ]),
    ).toBe(false);
  });
  it("persists visibility per table, defaulting off", () => {
    localStorage.clear();
    expect(readShowSystemFields("t")).toBe(false);
    writeShowSystemFields("t", true);
    expect(readShowSystemFields("t")).toBe(true);
    expect(readShowSystemFields("other")).toBe(false);
    writeShowSystemFields("t", false);
    expect(readShowSystemFields("t")).toBe(false);
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
    const rows = [
      row("a", { c: 2 }),
      row("b", { c: 3 }),
      row("x", { c: null }),
    ];
    expect(summarize("sum", field({ id: "c", type: "number" }), rows)).toBe(
      "5",
    );
    expect(
      summarize(
        "avg",
        field({ id: "c", type: "number", options: { precision: 2 } }),
        rows,
      ),
    ).toBe("2.5");
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
    expect(
      summarize("checked", field({ id: "d", type: "checkbox" }), rows),
    ).toBe("1/3");
  });

  it("is null when off or nothing matches", () => {
    expect(summarize("none", field({}), [row("a", {})])).toBeNull();
    expect(summarize("sum", field({ id: "c", type: "number" }), [])).toBeNull();
  });

  it("supports dates, unique counts and percentages", () => {
    const rows = [
      row("a", { d: "2026-03-15", n: "x" }),
      row("b", { d: "2026-01-02", n: "x" }),
      row("c", { d: null, n: "" }),
    ];
    expect(
      summarize("earliest", field({ id: "d", type: "date" }), rows),
    ).not.toBeNull();
    expect(
      summarize("latest", field({ id: "d", type: "date" }), rows),
    ).not.toBeNull();
    expect(summarize("unique", field({ id: "n", type: "select" }), rows)).toBe(
      "1",
    );
    expect(summarize("filledPct", field({ id: "n", type: "text" }), rows)).toBe(
      "67%",
    );
    expect(summarize("emptyPct", field({ id: "n", type: "text" }), rows)).toBe(
      "33%",
    );
  });
});

describe("summaryOptions", () => {
  it("is type-aware", () => {
    const options = (type: Parameters<typeof field>[0]["type"]) =>
      summaryOptions(field({ id: "x", type }));
    expect(options("number")).toContain("sum");
    expect(options("number")).not.toContain("earliest");
    expect(options("date")).toContain("earliest");
    expect(options("date")).not.toContain("sum");
    expect(options("checkbox")).toEqual(["checked", "filled", "empty"]);
    expect(options("select")).toContain("unique");
    expect(options("longtext")).toEqual(["filled", "empty"]);
    expect(options("datetime")).toContain("latest");
  });
});

describe("typeChangeKeepsValues (mirrors the API cast)", () => {
  it("keeps values within a storage family and text<->number", () => {
    expect(typeChangeKeepsValues("text", "email")).toBe(true);
    expect(typeChangeKeepsValues("text", "number")).toBe(true);
    expect(typeChangeKeepsValues("date", "datetime")).toBe(true);
  });
  it("clears across families and always for ticket", () => {
    expect(typeChangeKeepsValues("checkbox", "text")).toBe(false);
    expect(typeChangeKeepsValues("multiselect", "ticket")).toBe(false);
    expect(typeChangeKeepsValues("ticket", "json")).toBe(false);
  });
});

describe("isValidNumberInput", () => {
  it("accepts any float; decimals only round the display", () => {
    const f = field({ type: "number", options: { precision: 0 } });
    expect(isValidNumberInput("1.25", f)).toBe(true);
    expect(isValidNumberInput("-0.000123", f)).toBe(true);
    expect(isValidNumberInput("abc", f)).toBe(false);
    expect(isValidNumberInput("", f)).toBe(false);
  });

  it("still enforces min/max", () => {
    const f = field({ type: "number", options: { min: 0, max: 10 } });
    expect(isValidNumberInput("10.5", f)).toBe(false);
    expect(isValidNumberInput("9.99", f)).toBe(true);
  });
});
