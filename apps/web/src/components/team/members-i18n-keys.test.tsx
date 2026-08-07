import enUS from "@i18n/en-US.json";
import { cleanup, render, screen } from "@testing-library/react";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * #109: "The section name is broken."
 *
 * The Members page called t("team.members.people"). i18next's namespace
 * separator is ":", so a dotted key never resolves and i18next renders the raw
 * key string — the literal text "team.members.people" appeared as the heading.
 *
 * This suite RENDERS the component against the real locale bundle. An earlier
 * version only asserted i18next's separator behaviour in isolation, which
 * stayed green even when the broken dotted key was put back into the
 * component — it could never catch the bug it was written for.
 */

vi.mock("@/components/settings/agent-manager", () => ({
  AgentManager: () => <div data-testid="agent-manager" />,
  default: () => <div data-testid="agent-manager" />,
}));

vi.mock("@/components/team/members-table", () => ({
  MembersTable: () => <div data-testid="members-table" />,
  default: () => <div data-testid="members-table" />,
}));

import { OrganizationMembersGroups } from "@/components/team/organization-members-groups";

beforeAll(async () => {
  // Mirrors apps/web/src/lib/i18n/index.ts: defaultNS "common", ns per top key.
  await i18next.use(initReactI18next).init({
    resources: { "en-US": enUS as never },
    lng: "en-US",
    fallbackLng: "en-US",
    ns: Object.keys(enUS),
    defaultNS: "common",
    interpolation: { escapeValue: false },
  });
});

afterEach(cleanup);

function renderGroups(canManageAgents = true) {
  return render(
    <OrganizationMembersGroups
      organizationId="org-1"
      invitations={[]}
      users={[]}
      canManageAgents={canManageAgents}
    />,
  );
}

describe("Members page section headings (#109)", () => {
  it("renders real copy for the section headings, never a raw key", () => {
    renderGroups();

    expect(screen.getByRole("heading", { name: "People" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Agents" })).toBeTruthy();
  });

  it("shows no unresolved i18n key anywhere in the rendered output", () => {
    const { container } = renderGroups();

    // A dotted key renders verbatim, e.g. "team.members.people".
    expect(container.textContent).not.toMatch(
      /\b(team|common|organization)\.[a-z]+\.[a-zA-Z]+\b/,
    );
  });

  it("renders resolved copy for the non-admin agents notice", () => {
    renderGroups(false);

    const notice = screen.getByText(/admin/i);
    expect(notice.textContent).not.toContain("team.members");
    expect(notice.textContent).toBe(
      i18next.t("team:members.agentsManagedByAdmins"),
    );
  });
});
