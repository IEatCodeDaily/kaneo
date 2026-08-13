import { describe, expect, it } from "vitest";
import { capGroupItems, filterThenCapGroups } from "./picker-group-cap";

type Item = { id: string };
const group = (value: string, count: number) => ({
  value,
  label: value,
  items: Array.from({ length: count }, (_, i) => ({ id: `${value}-${i}` })),
});

describe("capGroupItems", () => {
  it("caps each group's items and reports the hidden count", () => {
    const groups = capGroupItems<Item>([group("a", 100), group("b", 10)], 30);
    expect(groups[0].items).toHaveLength(30);
    expect(groups[0].hiddenCount).toBe(70);
    expect(groups[1].items).toHaveLength(10);
    expect(groups[1].hiddenCount).toBe(0);
  });

  it("keeps order and identity of the visible items", () => {
    const groups = capGroupItems<Item>([group("a", 5)], 3);
    expect(groups[0].items.map((i) => i.id)).toEqual(["a-0", "a-1", "a-2"]);
  });
});

describe("filterThenCapGroups", () => {
  it("filters before capping so a match beyond the cap is still found", () => {
    const groups = filterThenCapGroups<Item>(
      [group("a", 100)],
      "a-90",
      (item) => item.id,
      30,
    );
    expect(groups[0].items.map((i) => i.id)).toEqual(["a-90"]);
    expect(groups[0].hiddenCount).toBe(0);
  });

  it("drops groups with no matches", () => {
    const groups = filterThenCapGroups<Item>(
      [group("a", 3), group("b", 3)],
      "b-1",
      (item) => item.id,
      30,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].value).toBe("b");
  });
});
