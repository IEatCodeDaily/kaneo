import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(import.meta.dirname, "../..");
const boardRoute = fs.readFileSync(
  path.join(
    webRoot,
    "routes/_layout/_authenticated/dashboard/organization/$organizationId/board/$boardId/board.tsx",
  ),
  "utf8",
);
const toolbar = fs.readFileSync(
  path.join(webRoot, "components/board/board-toolbar.tsx"),
  "utf8",
);

describe("board properties toggle placement", () => {
  it("renders the existing properties toggle in the board header, not the toolbar", () => {
    expect(boardRoute).toMatch(
      /<BoardLayout[\s\S]*?headerActions={[\s\S]*?data-testid="board-properties-toggle"[\s\S]*?<\/BoardLayout>/,
    );
    expect(boardRoute).toContain(
      "onClick={() => setIsPropertiesPanelOpen(true)}",
    );
    expect(toolbar).not.toContain('data-testid="board-properties-toggle"');
  });
});
