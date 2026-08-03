import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("task template drawer (#118)", () => {
  it("uses the task-detail drawer hierarchy instead of a settings card", () => {
    const source = readFileSync(
      `${process.cwd()}/src/routes/_layout/_authenticated/dashboard/settings/organization/templates.tsx`,
      "utf8",
    );

    expect(source).toContain("sm:max-w-md md:max-w-xl lg:max-w-3xl");
    expect(source).toContain("border-b border-border px-4 py-2.5");
    expect(source).toContain('id="template-title"');
    expect(source).toContain("text-xl font-semibold");
    expect(source).toContain("border-y border-border bg-sidebar");
    expect(source).not.toContain("rounded-xl border bg-muted/20");
  });
});
