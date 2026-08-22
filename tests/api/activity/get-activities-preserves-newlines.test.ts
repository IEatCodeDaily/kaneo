import { describe, expect, it, vi } from "vitest";

/**
 * KFL-330 root cause: get-activities.ts collapsed EVERY newline run on read
 * (`content.replace(/\n+/g, "\n")`, from upstream's d7344fac "Check list
 * won't save #640"). The database stores the blank lines correctly — verified
 * live: the stored comment is LINEA\n\nLINEB\n\nLINEC\n\n \n\nLINED but the
 * API wire format was LINEA\nLINEB\nLINEC\n \nLINED. Two client-side fixes
 * downstream of this (55cad7f8, e5fd0da3) treated symptoms and could never
 * hold.
 *
 * The upstream bug it "fixed" was checklists losing structure; but collapsing
 * paragraph breaks destroys more than it repairs — a blank line between
 * paragraphs is meaningful markdown. The collapse is removed entirely.
 *
 * These tests pin the read path: content must round-trip byte-for-byte.
 */

function makeDb(rows: Array<Record<string, unknown>>) {
  return {
    query: {
      activityTable: {
        findMany: () => Promise.resolve(structuredClone(rows)),
      },
    },
  };
}

async function loadController(rows: Array<Record<string, unknown>>) {
  vi.resetModules();
  vi.doMock("../../../apps/api/src/database", () => ({
    default: makeDb(rows),
  }));
  const mod = await import(
    "../../../apps/api/src/activity/controllers/get-activities"
  );
  return mod.default;
}

describe("getActivities preserves stored newlines", () => {
  it("keeps blank lines between paragraphs", async () => {
    const stored = "LINEA\n\nLINEB\n\nLINEC\n\n \n\nLINED";
    const getActivities = await loadController([
      { id: "a1", taskId: "t1", content: stored },
    ]);

    const [activity] = await getActivities("t1");
    expect(activity.content).toBe(stored);
  });

  it("does not touch content without newlines", async () => {
    const getActivities = await loadController([
      { id: "a1", taskId: "t1", content: "plain comment" },
    ]);

    const [activity] = await getActivities("t1");
    expect(activity.content).toBe("plain comment");
  });

  it("leaves activities without content alone", async () => {
    const getActivities = await loadController([
      { id: "a1", taskId: "t1", content: null },
    ]);

    const [activity] = await getActivities("t1");
    expect(activity.content).toBeNull();
  });
});
