import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTableComment,
  exportTableHistory,
  getTableActivity,
  revertTableActivity,
} from "./data-table";

vi.mock("@/fetchers/get-api-url", () => ({
  getApiUrl: (path: string) => path,
}));
afterEach(() => vi.unstubAllGlobals());
const target = { organizationId: "org", tableId: "table" };
describe("table history requests", () => {
  it("paginates older history without losing row scope", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json([]));
    vi.stubGlobal("fetch", fetch);
    await getTableActivity(target, "row", 200, 100);
    const query = new URL(String(fetch.mock.calls[0][0]), "https://test")
      .searchParams;
    expect(query.get("offset")).toBe("200");
    expect(query.get("limit")).toBe("100");
    expect(query.get("rowId")).toBe("row");
  });
  it("posts comments without changing their row scope or markdown", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ id: "event" }));
    vi.stubGlobal("fetch", fetch);
    await createTableComment(target, "**note**", "row");
    expect(fetch.mock.calls[0][0]).toBe(
      "/data-table/organization/org/table/comments",
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      content: "**note**",
      rowId: "row",
    });
    expect(fetch.mock.calls[0][1].credentials).toBe("include");
  });
  it("restores only the explicitly selected event and exports the full archive", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ success: true })),
      );
    vi.stubGlobal("fetch", fetch);
    await revertTableActivity(target, "event/1");
    await exportTableHistory(target);
    expect(fetch.mock.calls[0][0]).toBe(
      "/data-table/organization/org/table/activity/event%2F1/revert",
    );
    expect(fetch.mock.calls[0][1].method).toBe("POST");
    expect(fetch.mock.calls[1][0]).toBe(
      "/data-table/organization/org/table/history-export",
    );
  });
});
