import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelect = vi.fn();
const mockHasOrganizationPermission = vi.fn();

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
  schema: {
    boardTable: { id: "board.id", organizationId: "board.organization_id" },
    taskTable: { id: "task.id", boardId: "task.board_id" },
  },
}));

vi.mock("../../../apps/api/src/utils/require-organization-permission", () => ({
  hasOrganizationPermission: (...args: unknown[]) =>
    mockHasOrganizationPermission(...args),
}));

import {
  assertBoardPermission,
  assertTaskPermission,
  McpPermissionError,
} from "../../../apps/api/src/mcp/permissions";

/**
 * Build a drizzle-shaped select chain that resolves to `rows`.
 * The builder is awaited via `.limit(1)`, so every link must be chainable.
 */
function selectReturning(rows: unknown[]) {
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    limit: () => Promise.resolve(rows),
    // biome-ignore lint/suspicious/noThenProperty: drizzle query builders are thenable; the mock must mimic that.
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve),
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MCP task tool permissions (#38)", () => {
  it("rejects a caller whose organization role lacks the required task permission", async () => {
    mockSelect.mockReturnValue(selectReturning([{ organizationId: "org-1" }]));
    mockHasOrganizationPermission.mockResolvedValue(false);

    await expect(
      assertTaskPermission("viewer-user", "task-1", { task: ["update"] }),
    ).rejects.toBeInstanceOf(McpPermissionError);

    expect(mockHasOrganizationPermission).toHaveBeenCalledTimes(1);
    const [context, permissions] = mockHasOrganizationPermission.mock.calls[0];
    expect(permissions).toEqual({ task: ["update"] });
    expect(context.get("userId")).toBe("viewer-user");
    expect(context.get("organizationId")).toBe("org-1");
  });

  it("allows a caller that holds the required permission", async () => {
    mockSelect.mockReturnValue(selectReturning([{ organizationId: "org-1" }]));
    mockHasOrganizationPermission.mockResolvedValue(true);

    await expect(
      assertTaskPermission("member-user", "task-1", { task: ["update"] }),
    ).resolves.toBe("org-1");
  });

  it("rejects when the task's organization cannot be resolved", async () => {
    mockSelect.mockReturnValue(selectReturning([]));
    mockHasOrganizationPermission.mockResolvedValue(true);

    await expect(
      assertTaskPermission("member-user", "missing-task", { task: ["read"] }),
    ).rejects.toThrow(/not found or not accessible/i);
    expect(mockHasOrganizationPermission).not.toHaveBeenCalled();
  });

  it("gates create_task on the board's organization", async () => {
    mockSelect.mockReturnValue(selectReturning([{ organizationId: "org-9" }]));
    mockHasOrganizationPermission.mockResolvedValue(false);

    await expect(
      assertBoardPermission("viewer-user", "board-1", { task: ["create"] }),
    ).rejects.toThrow(/Forbidden/);

    const [context, permissions] = mockHasOrganizationPermission.mock.calls[0];
    expect(permissions).toEqual({ task: ["create"] });
    expect(context.get("organizationId")).toBe("org-9");
  });
});
