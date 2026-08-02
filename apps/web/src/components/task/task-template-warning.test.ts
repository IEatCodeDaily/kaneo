import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sidebar = readFileSync(
  resolve(process.cwd(), "src/components/task/task-details-sheet.tsx"),
  "utf8",
);

describe("existing task template warning (#118)", () => {
  it("requires confirmation before replacing current task values", () => {
    expect(sidebar).toContain("<AlertDialog");
    expect(sidebar).toContain('t("tasks:templates.applyWarning")');
    expect(sidebar).toContain("updateTask({ ...task, ...pendingTemplate })");
  });
});
