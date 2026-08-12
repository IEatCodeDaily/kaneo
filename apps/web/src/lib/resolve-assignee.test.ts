import { describe, expect, it } from "vitest";
import { resolveAssignee } from "@/lib/resolve-assignee";

/**
 * Regression: assigning a ticket to a TEAM showed "Unassigned" in the ticket
 * status bar / properties sidebar.
 *
 * `userId` and `teamId` are mutually exclusive assignment columns. Every
 * display site branched on `task.userId` alone, so a team assignment — which
 * persists correctly and shows in the picker — rendered as unassigned.
 *
 * These call the SAME helper the sidebar renders from, so a regression in the
 * shipped resolution rule fails here.
 */

const labels = {
  unassignedLabel: "Unassigned",
  teamFallbackLabel: "Team",
};

describe("resolveAssignee", () => {
  it("shows the team name when the ticket is assigned to a team", () => {
    const result = resolveAssignee({
      task: { teamId: "team-1", teamAssigneeName: "Platform" },
      ...labels,
    });

    expect(result.label).toBe("Platform");
    expect(result.label).not.toBe("Unassigned");
    expect(result.hasAssignee).toBe(true);
    expect(result.teamName).toBe("Platform");
  });

  it("falls back to a generic team label if the name has not loaded yet", () => {
    // Must never regress to "Unassigned" — the assignment does exist.
    const result = resolveAssignee({
      task: { teamId: "team-1", teamAssigneeName: null },
      ...labels,
    });

    expect(result.label).toBe("Team");
    expect(result.hasAssignee).toBe(true);
  });

  it("still shows the member name for user assignment", () => {
    const task = { userId: "user-1", assigneeName: "Ada" };

    expect(
      resolveAssignee({ task, memberName: "Ada Lovelace", ...labels }).label,
    ).toBe("Ada Lovelace");
    // Falls back to the row's denormalised name when members haven't loaded.
    expect(resolveAssignee({ task, ...labels }).label).toBe("Ada");
    expect(resolveAssignee({ task, ...labels }).teamName).toBeNull();
  });

  it("shows Unassigned only when neither a user nor a team is set", () => {
    const result = resolveAssignee({
      task: { userId: null, teamId: null },
      ...labels,
    });

    expect(result.label).toBe("Unassigned");
    expect(result.hasAssignee).toBe(false);
    expect(resolveAssignee({ task: undefined, ...labels }).hasAssignee).toBe(
      false,
    );
  });

  it("prefers the team name over a stale member name", () => {
    // Reassigning user → team must not keep showing the old member.
    const result = resolveAssignee({
      task: {
        userId: null,
        teamId: "team-2",
        teamAssigneeName: "Design",
        assigneeName: "Ada",
      },
      memberName: "Ada Lovelace",
      ...labels,
    });

    expect(result.label).toBe("Design");
    expect(result.teamName).toBe("Design");
  });
});
