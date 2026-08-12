import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression: assigning or unassigning a ticket from the UI returned
 * "Internal Server Error" while the same call made directly against the API
 * with `null` succeeded.
 *
 * The fetcher coerced a missing assignee to `""` (`task.userId || ""`).
 * `assignee_id` / `team_assignee_id` are FK columns, so Postgres received a
 * literal empty-string id that matches no user/team and the UPDATE failed:
 *
 *   Failed query: update "task" set "assignee_id" = $1, "team_assignee_id" = $2
 *   params: tv8zd28v9nthir4yop7vu63k,,...
 *
 * Assigning a user still sent `teamId: ""`, so EVERY assign broke too, not just
 * unassignment. These tests assert the wire payload carries null.
 */

const put = vi.fn();

vi.mock("@kaneo/libs", () => ({
  client: { task: { assignee: { ":id": { $put: put } } } },
}));

const { default: updateTaskAssignee } = await import(
  "@/fetchers/task/update-task-assignee"
);

function sentJson() {
  return put.mock.calls[0]?.[0]?.json;
}

describe("updateTaskAssignee wire payload", () => {
  beforeEach(() => {
    put.mockReset();
    put.mockResolvedValue({ ok: true, json: async () => ({ id: "task-1" }) });
  });

  it("sends null — never '' — for the unset team when assigning a user", async () => {
    await updateTaskAssignee("task-1", { userId: "user-1", teamId: null });

    expect(sentJson()).toEqual({ userId: "user-1", teamId: null });
    // The empty string is what Postgres rejected as an FK value.
    expect(sentJson().teamId).not.toBe("");
  });

  it("sends null — never '' — for the unset user when assigning a team", async () => {
    await updateTaskAssignee("task-1", { userId: null, teamId: "team-1" });

    expect(sentJson()).toEqual({ userId: null, teamId: "team-1" });
    expect(sentJson().userId).not.toBe("");
  });

  it("sends null for both fields when unassigning", async () => {
    await updateTaskAssignee("task-1", { userId: null, teamId: null });

    expect(sentJson()).toEqual({ userId: null, teamId: null });
    expect(Object.values(sentJson())).not.toContain("");
  });

  it("propagates the server error text instead of swallowing it", async () => {
    put.mockResolvedValue({
      ok: false,
      text: async () => "Internal Server Error",
    });

    await expect(
      updateTaskAssignee("task-1", { userId: "user-1", teamId: null }),
    ).rejects.toThrow("Internal Server Error");
  });
});
