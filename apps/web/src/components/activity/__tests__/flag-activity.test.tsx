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

// The unflag control only renders while the flag is still active, so the row
// needs the task's live flag list.
const activeFlags: { id: string; resolvedAt: string | null }[] = [
  { id: "flag-1", resolvedAt: null },
];

vi.mock("@/hooks/queries/flag/use-get-task-flags", () => ({
  default: () => ({ data: activeFlags }),
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

  it("puts the unflag control on its own row under the flag entry", () => {
    renderActivity(raised);

    // Own row beneath the entry, not an inline word in the sentence.
    const control = screen.getByTestId("unflag-control-flag-1");
    expect(control.tagName).toBe("FORM");
    expect(screen.getByTestId("unflag-note-flag-1")).toBeTruthy();
  });

  it("requires a note before the flag can be resolved", () => {
    renderActivity(raised);

    const submit = screen.getByTestId(
      "unflag-submit-flag-1",
    ) as HTMLButtonElement;

    // Mandatory: disabled while the Notes field is empty.
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(resolveMutate).not.toHaveBeenCalled();

    // Whitespace alone is not a note.
    fireEvent.change(screen.getByTestId("unflag-note-flag-1"), {
      target: { value: "   " },
    });
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId("unflag-note-flag-1"), {
      target: { value: "  approved by design  " },
    });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    expect(resolveMutate).toHaveBeenCalledWith(
      { flagId: "flag-1", taskId: "task-1", resolveNote: "approved by design" },
      expect.anything(),
    );
  });

  it("degrades to a plain verb for legacy entries with no flag type name", () => {
    // flag_resolved rows written before the API carried the type name have no
    // name/colour. Rendering the chip regardless produced an empty red box in
    // the live feed.
    const legacy = {
      ...baseActivity,
      id: "act-legacy",
      type: "flag_resolved",
      eventData: {
        flagId: "flag-9",
        flagTypeId: "type-x",
        resolvedBy: "user-a",
        targetUserId: "user-b",
        targetTeamId: null,
      },
    };

    renderActivity(legacy);

    expect(screen.queryByTestId("activity-flag-chip")).toBeNull();
    expect(screen.getByText("activity:flagResolved")).toBeTruthy();
    expect(screen.getByTestId("activity-flag-target")).toBeTruthy();
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
        resolveNote: "Approved after the accessibility review",
      },
    };

    renderActivity(resolved);

    const chip = screen.getByTestId("activity-flag-chip");
    expect(chip.textContent).toContain("Need Help");
    // Regression: flag_resolved used to publish no colour, so it rendered grey
    // next to its own coloured flag_raised entry.
    expect(chip.getAttribute("style")).toContain("rgb(59, 130, 246)");
    expect(screen.getByText("activity:flagResolved")).toBeTruthy();
    // #167: the note is mandatory during unflag, so it must survive into the
    // audit trail instead of disappearing after submit.
    const note = screen.getByTestId("activity-flag-resolve-note");
    expect(note.textContent).toContain("activity:resolutionNote");
    expect(note.textContent).toContain(
      "Approved after the accessibility review",
    );
    expect(screen.queryByText("flags:dialog.unflag")).toBeNull();
  });
});
