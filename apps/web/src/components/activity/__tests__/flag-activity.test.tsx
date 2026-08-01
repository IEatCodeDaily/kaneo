import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * #107 second rejection, verbatim:
 *   "flag history only show up after flag is unflagged. It should show in the
 *    activity history who flagged what for who immediately. and there should be
 *    an unflag button on the activity. Also, the activity history should show a
 *    more rich activity history, with colour and icon of the flags."
 *
 * Root cause of the "only after unflag" half was NOT the renderer: the API
 * always wrote flag_raised immediately. useCreateTaskFlag invalidated
 * ["task-flags"] but not ["activities"], while useResolveTaskFlag invalidated
 * both — so the raised entry only surfaced once you unflagged. That cache half
 * is covered in use-create-task-flag.test.ts; this suite covers the rendering.
 */

const resolveMutate = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
  // lib/format -> lib/i18n boots a real i18next instance under vitest.
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("@/hooks/mutations/flag/use-resolve-task-flag", () => ({
  default: () => ({ mutate: resolveMutate, isPending: false }),
}));

vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: { id: "org-1" } }),
}));

vi.mock(
  "@/hooks/queries/organization-members/use-get-organization-members",
  () => ({
    default: () => ({
      data: [
        { user: { id: "user-a", name: "Ada", email: "ada@example.com" } },
        { user: { id: "user-b", name: "Grace", email: "grace@example.com" } },
      ],
    }),
  }),
);

vi.mock("./comment-card", () => ({ default: () => <div /> }));

import Activity from "@/components/activity";
import { Timeline } from "@/components/ui/timeline";

// TimelineItem reads context from its Timeline parent; render the real one
// rather than stubbing it, so the activity row is exercised as shipped.
function renderActivity(activity: unknown) {
  return render(
    <Timeline>
      <Activity activity={activity as never} step={1} />
    </Timeline>,
  );
}

const baseActivity = {
  id: "act-1",
  taskId: "task-1",
  userId: "user-a",
  content: null,
  createdAt: "2026-08-01T07:02:26.320Z",
  editHistory: [],
  externalSource: null,
  externalUrl: null,
  externalUserName: null,
  externalUserAvatar: null,
};

const raised = {
  ...baseActivity,
  type: "flag_raised",
  eventData: {
    flagId: "flag-1",
    flagTypeId: "type-blocked",
    flagTypeName: "Blocked",
    flagTypeColor: "#ef4444",
    flagTypeIcon: "ban",
    targetUserId: "user-b",
    targetTeamId: null,
  },
};

afterEach(() => {
  cleanup();
  resolveMutate.mockReset();
});

describe("flag activity entries (#107)", () => {
  it("shows what was flagged and who it was flagged for", () => {
    renderActivity(raised);

    const chip = screen.getByTestId("activity-flag-chip");
    expect(chip.textContent).toContain("Blocked");
    expect(screen.getByText("activity:flagRaised")).toBeTruthy();
    // "for Grace" — the target, resolved through org members.
    expect(screen.getByTestId("activity-flag-target").textContent).toBe(
      'activity:flagTarget:{"target":"Grace"}',
    );
  });

  it("renders the flag type's own colour and icon, not a generic marker", () => {
    renderActivity(raised);

    const chip = screen.getByTestId("activity-flag-chip");
    expect(chip.getAttribute("style")).toContain("rgb(239, 68, 68)");
    // The chip carries the mapped icon (ban), not just text.
    expect(chip.querySelector("svg")).not.toBeNull();
  });

  it("offers an unflag button on the raised entry that resolves the flag", () => {
    renderActivity(raised);

    fireEvent.click(screen.getByText("flags:dialog.unflag"));

    expect(resolveMutate).toHaveBeenCalledWith({
      flagId: "flag-1",
      taskId: "task-1",
    });
  });

  it("renders a resolved entry with its own colour and no unflag button", () => {
    const resolved = {
      ...baseActivity,
      id: "act-2",
      type: "flag_resolved",
      eventData: {
        flagId: "flag-1",
        flagTypeId: "type-help",
        flagTypeName: "Need Help",
        flagTypeColor: "#3b82f6",
        flagTypeIcon: "life-buoy",
        targetUserId: "user-b",
        targetTeamId: null,
        resolvedBy: "user-a",
      },
    };

    renderActivity(resolved);

    const chip = screen.getByTestId("activity-flag-chip");
    expect(chip.textContent).toContain("Need Help");
    // Regression: flag_resolved used to publish no colour, so it rendered grey
    // next to its own coloured flag_raised entry.
    expect(chip.getAttribute("style")).toContain("rgb(59, 130, 246)");
    expect(screen.getByText("activity:flagResolved")).toBeTruthy();
    expect(screen.queryByText("flags:dialog.unflag")).toBeNull();
  });
});
