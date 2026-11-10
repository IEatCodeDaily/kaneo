import { describe, expect, it } from "vitest";
import type { DataTableField } from "@/types/data-table";
import { csvParse, csvSerialize } from "./data-table-csv";

const choices = new Map([
  ["c1", { id: "c1", label: "Fermentation", color: "#f59e0b" }],
]);

const fields: DataTableField[] = [
  { id: "f1", tableId: "t", name: "Batch", type: "text", options: null, position: 0, createdAt: "", updatedAt: "" },
  { id: "f2", tableId: "t", name: "Stage", type: "select", options: { choices: [{ id: "c1", label: "Fermentation", color: "#f59e0b" }] }, position: 1, createdAt: "", updatedAt: "" },
  { id: "f3", tableId: "t", name: "Cost", type: "currency", options: { code: "IDR" }, position: 2, createdAt: "", updatedAt: "" },
  { id: "f4", tableId: "t", name: "Note, with comma", type: "text", options: null, position: 3, createdAt: "", updatedAt: "" },
];

describe("csvSerialize", () => {
  it("renders a header row and data with choice labels and quoted commas", () => {
    const out = csvSerialize(
      fields,
      [
        {
          id: "r1",
          position: 0,
          createdAt: "",
          updatedAt: "",
          values: { f1: "B-1", f2: "c1", f3: 18200000, f4: 'say "hi", ok' },
        },
      ],
      choices,
      new Map(),
    );
    const [header, data] = out.split("\r\n");
    expect(header).toBe('Batch,Stage,Cost,"Note, with comma"');
    expect(data).toBe('B-1,Fermentation,18200000,"say ""hi"", ok"');
  });

  it("leaves empty values empty and booleans as true/false", () => {
    const checkbox: DataTableField = {
      id: "f5",
      tableId: "t",
      name: "QC pass",
      type: "checkbox",
      options: null,
      position: 4,
      createdAt: "",
      updatedAt: "",
    };
    const out = csvSerialize(
      [checkbox],
      [{ id: "r", position: 0, createdAt: "", updatedAt: "", values: { f5: true } }],
      choices,
      new Map(),
    );
    expect(out.split("\r\n")[1]).toBe("true");
    const empty = csvSerialize(
      [checkbox],
      [{ id: "r", position: 0, createdAt: "", updatedAt: "", values: {} }],
      choices,
      new Map(),
    );
    expect(empty.split("\r\n")[1]).toBe("");
  });
});

describe("csvParse", () => {
  it("parses quoted cells with commas, escaped quotes and CRLF rows", () => {
    const rows = csvParse('a,"b,1","say ""x"""\r\nc,d,e\n');
    expect(rows).toEqual([
      ["a", "b,1", 'say "x"'],
      ["c", "d", "e"],
    ]);
  });

  it("keeps embedded newlines inside quoted cells", () => {
    const rows = csvParse('"line1\nline2",after');
    expect(rows).toEqual([["line1\nline2", "after"]]);
  });

  it("round-trips through serialize", () => {
    const out = csvSerialize(fields, [
      {
        id: "r1",
        position: 0,
        createdAt: "",
        updatedAt: "",
        values: { f1: "x,y", f2: "c1", f3: 1.5, f4: "a\nb" },
      },
    ], choices, new Map());
    expect(csvParse(out)[1]).toEqual(["x,y", "Fermentation", "1.5", "a\nb"]);
  });
});
