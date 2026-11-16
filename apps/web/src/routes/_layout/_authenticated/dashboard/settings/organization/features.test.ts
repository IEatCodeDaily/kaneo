import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  `${process.cwd()}/src/routes/_layout/_authenticated/dashboard/settings/organization/features.tsx`,
  "utf8",
);

// The settings surface must persist this organization-level feature through the
// same mutation path as other flags, rather than making its state local-only.
describe("organization Work feature", () => {
  it("renders its Alpha toggle and persists checked state", () => {
    expect(source).toContain('<h2 className="font-semibold">Work</h2>');
    expect(source).toContain("Alpha");
    expect(source).toContain('aria-label="Enable Work"');
    expect(source).toContain("workEnabled: checked");
  });
});

describe("organization Dashboards feature", () => {
  it("has its own toggle that depends on Tables", () => {
    expect(source).toContain('aria-label="Enable Dashboards"');
    expect(source).toContain("dashboardsEnabled: checked");
    expect(source).toMatch(/pendingFeature !== null \|\|\s+!tablesEnabled/);
  });

  it("marks every feature with the shared stage badge", () => {
    expect(source).not.toContain("rounded-full border");
    expect(source.match(/<FeatureStageBadge stage=/g)).toHaveLength(4);
  });
});
