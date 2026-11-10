import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = "src/routes/_layout/_authenticated/dashboard/settings/";
describe("single settings sidebar", () => {
  it("keeps account and organization layouts content-only", () => {
    for (const file of ["account.tsx", "organization.tsx"]) {
      const source = readFileSync(root + file, "utf8");
      expect(source).not.toContain("<aside");
      expect(source).toContain("<Outlet");
    }
  });
  it("gives boards and repos the shared resource list + tabs shell", () => {
    for (const file of ["boards.tsx", "repos.tsx"]) {
      const source = readFileSync(root + file, "utf8");
      expect(source).toContain("<ResourceSettingsShell");
    }
    const shell = readFileSync(
      "src/components/settings/resource-settings-shell.tsx",
      "utf8",
    );
    expect(shell).toContain("<Outlet");
    // Regression: the first-resource redirect must only fire on the bare
    // section URL. It used to fire whenever no resource was active, which
    // includes the render while navigating AWAY, trapping the user.
    expect(shell).toMatch(/if \(onBareSection && !activeId && firstId\)/);
  });
  it("keeps the legacy agent destination inside canonical settings", () => {
    const source = readFileSync(`${root}organization/agents.tsx`, "utf8");
    expect(source).toContain('to: "/dashboard/settings/organization/members"');
    expect(source).not.toContain("params: { organizationSlug:");
  });
  it("keeps Teams in the settings shell instead of redirecting out", () => {
    const source = readFileSync(`${root}organization/teams.tsx`, "utf8");
    expect(source).not.toContain("throw redirect");
    expect(source).toContain("component: TeamsManagement");
  });
});
