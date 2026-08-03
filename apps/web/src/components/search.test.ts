import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/search.tsx"),
  "utf8",
);

describe("sidebar create-ticket shortcut (#186)", () => {
  it("reuses the existing modal beside search in expanded and collapsed modes", () => {
    expect(source.match(/setCreateOpen\(true\)/g)).toHaveLength(2);
    expect(source).toContain("<CreateTaskModal");
    expect(source).toContain("boardId={boardId}");
    expect(source).toContain('status={isBacklog ? "planned" : undefined}');
    expect(
      source.match(/navigation:commandPalette\.createTask/g)?.length,
    ).toBeGreaterThanOrEqual(3);
  });
});
