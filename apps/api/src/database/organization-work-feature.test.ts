import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { organizationTable } from "./schema";

describe("organization Work feature persistence", () => {
  it("stores Work as a disabled-by-default boolean", () => {
    const column = organizationTable.workEnabled;

    expect(column.name).toBe("work_enabled");
    expect(column.notNull).toBe(true);
    expect(column.default).toBe(false);
  });

  it("registers Work as an updatable Better Auth organization field", () => {
    const authSource = readFileSync(`${process.cwd()}/src/auth.ts`, "utf8");

    expect(authSource).toContain("workEnabled: {");
    expect(authSource).toContain('type: "boolean"');
    expect(authSource).toContain("input: true");
    expect(authSource).toContain("defaultValue: false");
  });
});
