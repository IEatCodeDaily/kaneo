import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * KFL-365 regression guard: the workspace-era Project domain is retired.
 * Active source must not reference its dead contracts or import from the
 * deleted legacy directories. Historical drizzle migrations, marketing site
 * mock data, and the better-auth workspace billing plugin are out of scope.
 */

const REPO_ROOT = path.resolve(__dirname, "../..");
const SCAN_ROOTS = ["apps/api/src", "apps/web/src"];

// Live files that legitimately contain workspace-era tokens (better-auth
// workspace plugin, GitHub webhook honoring stored external refs, etc.).
// Keep this list tight — additions need a reason.
const ALLOWLIST = new Set([
  "apps/api/src/plugins/github/webhooks/issue-closed.ts",
]);

const FORBIDDEN_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "projectTable schema reference", regex: /\bprojectTable\b/ },
  { name: "task.projectId column reference", regex: /\btask\.projectId\b/ },
  {
    name: "legacy /dashboard/workspace/.../project/ route",
    regex: /\/dashboard\/workspace\/[^"'`\n]*\/project\//,
  },
  {
    name: "import from deleted legacy project module",
    regex:
      /from\s+["'][^"']*(?:api\/src\/project|hooks\/mutations\/project\/|hooks\/queries\/project\/|fetchers\/project\/|fetchers\/board\/reorder-projects|components\/nav-projects|board\/controllers\/reorder-projects)[^"']*["']/,
  },
];

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "drizzle") continue;
      out.push(...collectSourceFiles(full));
    } else if (
      /\.(ts|tsx)$/.test(entry) &&
      !/\.test\.(ts|tsx)$/.test(entry) &&
      !/\.d\.ts$/.test(entry)
    ) {
      out.push(full);
    }
  }
  return out;
}

describe("legacy workspace-era Project code guard (KFL-365)", () => {
  const files = SCAN_ROOTS.flatMap((root) =>
    collectSourceFiles(path.join(REPO_ROOT, root)),
  );

  it("scans a non-trivial number of active source files", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("active source contains no legacy Project contracts", () => {
    const violations: string[] = [];
    for (const file of files) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
      if (ALLOWLIST.has(rel)) continue;
      const content = readFileSync(file, "utf8");
      for (const { name, regex } of FORBIDDEN_PATTERNS) {
        const match = content.match(regex);
        if (match) {
          violations.push(`${rel}: [${name}] ${match[0]}`);
        }
      }
    }
    expect(
      violations,
      `Legacy Project references:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("deleted legacy directories stay deleted", () => {
    const deadPaths = [
      "apps/api/src/project",
      "apps/api/src/board/controllers/reorder-projects.ts",
      "apps/web/src/components/nav-projects.tsx",
      "apps/web/src/hooks/mutations/project",
      "apps/web/src/hooks/queries/project",
      "apps/web/src/fetchers/project",
      "apps/web/src/fetchers/board/reorder-projects.ts",
    ];
    const resurrected = deadPaths.filter((p) => {
      try {
        statSync(path.join(REPO_ROOT, p));
        return true;
      } catch {
        return false;
      }
    });
    expect(
      resurrected,
      `Resurrected legacy paths: ${resurrected.join(", ")}`,
    ).toEqual([]);
  });
});
