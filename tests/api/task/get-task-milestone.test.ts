import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("../../../apps/api/src/database", () => ({
  default: { select: mocks.select },
}));

import getTask from "../../../apps/api/src/task/controllers/get-task";

describe("getTask milestone contract", () => {
  it("returns the milestone used by the task detail header", async () => {
    const row = { id: "task-1", milestoneId: "milestone-1" };
    const limit = vi.fn().mockResolvedValue([row]);
    const where = vi.fn(() => ({ limit }));
    const leftJoin = vi.fn(() => ({ leftJoin, where }));
    const from = vi.fn(() => ({ leftJoin }));
    mocks.select.mockImplementation((fields) => {
      expect(fields).toHaveProperty("milestoneId");
      return { from };
    });

    await expect(getTask("task-1")).resolves.toMatchObject(row);
  });
});
