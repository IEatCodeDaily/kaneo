import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const onConflictDoNothing = vi.fn(async () => {});
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));
  return { onConflictDoNothing, values, insert };
});

vi.mock("../../../apps/api/src/database", () => ({
  default: { insert: mocks.insert },
}));

import ensureTaskFollowers from "../../../apps/api/src/task/controllers/ensure-task-followers";

describe("ensureTaskFollowers (KFL-363)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists every unique qualifying relationship in one idempotent insert", async () => {
    await ensureTaskFollowers({
      taskId: "task-1",
      userIds: ["creator", "assignee", "mentioned", "mentioned", null],
    });

    expect(mocks.values).toHaveBeenCalledWith([
      { taskId: "task-1", userId: "creator" },
      { taskId: "task-1", userId: "assignee" },
      { taskId: "task-1", userId: "mentioned" },
    ]);
    expect(mocks.onConflictDoNothing).toHaveBeenCalledTimes(1);
  });

  it("does not issue an empty insert", async () => {
    await ensureTaskFollowers({ taskId: "task-1", userIds: [null, undefined] });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
