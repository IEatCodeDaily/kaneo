import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("GitHub label provenance (#147)", () => {
  it("marks every GitHub label insertion as repo-owned", () => {
    for (const path of [
      "apps/api/src/github-integration/controllers/import-issues.ts",
      "apps/api/src/plugins/github/webhooks/label-created.ts",
      "apps/api/src/plugins/github/webhooks/issue-labeled.ts",
    ]) {
      expect(read(path)).toContain('source: "repo"');
    }
  });

  it("repairs only labels provably attached through GitHub issue links", () => {
    const migration = read(
      "apps/api/drizzle/0058_backfill_repo_label_source.sql",
    );
    expect(migration).toContain("el.\"resource_type\" = 'issue'");
    expect(migration).toContain("i.\"type\" = 'github'");
    expect(migration).not.toContain("qa-sync-test");
  });
});
