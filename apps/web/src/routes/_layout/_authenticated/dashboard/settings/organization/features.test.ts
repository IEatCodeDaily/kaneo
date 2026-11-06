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
    expect(source).toContain('<h2 className="font-medium">Work</h2>');
    expect(source).toContain("Alpha");
    expect(source).toContain('aria-label="Enable Work"');
    expect(source).toContain("workEnabled: checked");
  });
});
