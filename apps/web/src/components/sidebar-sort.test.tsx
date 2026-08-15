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

  /*
    KFL-190: the server already ranks archived boards last; this client-side
    reconcile used to undo that by honouring a stale persisted position, so
    archival has to win over the saved order.
  */
  it("keeps archived entries last regardless of persisted position", () => {
    const boards = [
      { id: "a", archivedAt: null },
      { id: "b", archivedAt: "2026-08-01T00:00:00.000Z" },
      { id: "c", archivedAt: null },
    ];
    expect(
      reconcileSidebarOrder(boards, ["b", "c", "a"]).map(({ id }) => id),
    ).toEqual(["c", "a", "b"]);
  });

  it("orders archived entries among themselves by persisted position", () => {
    const boards = [
      { id: "a", archivedAt: "2026-08-01T00:00:00.000Z" },
      { id: "b", archivedAt: "2026-08-02T00:00:00.000Z" },
      { id: "c", archivedAt: null },
    ];
    expect(
      reconcileSidebarOrder(boards, ["b", "a", "c"]).map(({ id }) => id),
    ).toEqual(["c", "b", "a"]);
  });
});
