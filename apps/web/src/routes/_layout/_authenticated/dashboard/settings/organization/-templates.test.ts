import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("task template drawer (#118)", () => {
  it("uses the task-detail drawer hierarchy instead of a settings card", () => {
    const source = readFileSync(
      `${process.cwd()}/src/routes/_layout/_authenticated/dashboard/settings/organization/templates.tsx`,
      "utf8",
    );

    // Width and header bar come from the Sheet primitive (size="lg").
    expect(source).toContain('<SheetContent size="lg">');
    expect(source).toContain("<SheetHeader>");
    expect(source).toContain('id="template-title"');
    expect(source).toContain("text-xl font-semibold");
    expect(source).toContain("border-y border-border bg-sidebar");
    expect(source.match(/\bBeta\b/g)).toHaveLength(1);
    expect(source).not.toContain("rounded-xl border bg-muted/20");
  });
});
