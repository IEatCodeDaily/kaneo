import { describe, expect, it } from "vitest";
import { filterOperators, isFilterGroup } from "./filter-expression";

describe("filter expression trust boundary", () => {
  const condition = { fieldId: "f", op: "eq", value: 0 };
  const group = (...children: unknown[]) => ({ conjunction: "and", children });
  it("bounds depth, conditions, empty groups, lists and text before SQL recursion", () => {
    expect(isFilterGroup(group(group(group(condition))))).toBe(true);
    expect(isFilterGroup(group(group(group(group(condition)))))).toBe(false);
    expect(
      isFilterGroup(group(...Array.from({ length: 50 }, () => condition))),
    ).toBe(true);
    expect(
      isFilterGroup(group(...Array.from({ length: 51 }, () => condition))),
    ).toBe(false);
    expect(
      isFilterGroup(group(...Array.from({ length: 50 }, () => group(group())))),
    ).toBe(false);
    for (const value of [
      null,
      [1],
      Array(51).fill("a"),
      "a".repeat(1001),
      Number.NaN,
    ])
      expect(isFilterGroup(group({ ...condition, value }))).toBe(false);
    expect(isFilterGroup(group({ ...condition, op: "DROP TABLE" }))).toBe(
      false,
    );
    expect(isFilterGroup({ conjunction: "xor", children: [] })).toBe(false);
    expect(isFilterGroup(group())).toBe(true);
  });
  it("keeps the operator registry type-specific", () => {
    expect(filterOperators("link")).toEqual(["hasAny", "isEmpty"]);
    expect(filterOperators("checkbox")).toEqual(["isChecked", "isNotChecked"]);
    expect(filterOperators("number")).not.toContain("contains");
    expect(filterOperators("datetime")).toContain("pastDays");
    expect(filterOperators("user")).toContain("isMe");
  });
});
