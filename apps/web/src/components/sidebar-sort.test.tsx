import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { reconcileSidebarOrder } from "./sidebar-sort";

afterEach(cleanup);

const items = (ids: string[]) => ids.map((id) => ({ id }));

describe("reconcileSidebarOrder", () => {
  it("applies persisted order, drops removed ids, and appends unseen entries", () => {
    expect(
      reconcileSidebarOrder(items(["new", "b", "a"]), ["gone", "a", "b"]).map(
        ({ id }) => id,
      ),
    ).toEqual(["a", "b", "new"]);
  });

  it("keeps board and repository orders independent", () => {
    const current = items(["a", "b", "c"]);
    expect(
      reconcileSidebarOrder(current, ["c", "a", "b"]).map(({ id }) => id),
    ).toEqual(["c", "a", "b"]);
    expect(
      reconcileSidebarOrder(current, ["b", "c", "a"]).map(({ id }) => id),
    ).toEqual(["b", "c", "a"]);
  });
});
