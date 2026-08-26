import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * KFL-365 regression guard: the workspace-era Project domain — a Project
 * scoped by `workspaceId` that owned Tasks directly via `task.projectId` —
 * is retired. Active source must not reference those dead CONTRACTS or
 * route shapes. Historical drizzle migrations, marketing site mock data,
 * and the better-auth workspace billing plugin are out of scope.
 *
 * KFL-366 supersession (orchestrator ruling, see
 * .wayfinder/pipeline/KFL-366.qc.md defect 2): this guard originally also
 * banned the path names `apps/api/src/project/`, `components/nav-projects`,
 * `fetchers/project/`, `hooks/.../project/` outright, on the assumption those
 * names could only mean the deleted workspace-era code. KFL-366 introduces
 * a NEW, unrelated Project domain (organization-scoped, outcome-tracking,
 * no `workspaceId`, no `task.projectId`, no Board/Ticket ownership) that
 * legitimately reuses those same directory names. The guard's INTENT was
 * always to ban the workspace-era CONTRACT, not to reserve the names
 * forever, so the blanket path bans are removed below. The workspace-era
 * CONTRACT bans (task.projectId, projectTable joined to workspace_id, the
 * legacy /dashboard/workspace/.../project/ route, and the specific dead
 * board-reorder files) remain and must still fail if reintroduced.
 */

const REPO_ROOT = path.resolve(__dirname, "../..");
const SCAN_ROOTS = ["apps/api/src", "apps/web/src"];

// Live files that legitimately contain workspace-era tokens (better-auth
// workspace plugin, GitHub webhook honoring stored external refs, etc.).
// Keep this list tight — additions need a reason.
const ALLOWLIST = new Set([
  "apps/api/src/plugins/github/webhooks/issue-closed.ts",
]);

// Per-file regex bans: a single line/token that is unambiguously the
// workspace-era contract regardless of surrounding context.
const FORBIDDEN_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "task.projectId column reference", regex: /\btask\.projectId\b/ },
  {
    name: "legacy /dashboard/workspace/.../project/ route",
    regex: /\/dashboard\/workspace\/[^"'`\n]*\/project\//,
  },
  {
    name: "import from dead board-reorder module",
    regex:
      /from\s+["'][^"']*(?:fetchers\/board\/reorder-projects|board\/controllers\/reorder-projects)[^"']*["']/,
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

  it("no file couples projectTable to the workspace-era workspaceId/workspace_id column", () => {
    // projectTable alone is legitimate again under KFL-366 (organization-
    // scoped, no workspaceId). What must stay banned is the workspace-era
    // COMBINATION: a projectTable reference in the same file as a
    // workspaceId/workspace_id column, which only makes sense for the old
    // workspace-owned Project.
    const violations: string[] = [];
    for (const file of files) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
      if (ALLOWLIST.has(rel)) continue;
      const content = readFileSync(file, "utf8");
      if (
        /\bprojectTable\b/.test(content) &&
        /\bworkspace_?[Ii]d\b/.test(content)
      ) {
        violations.push(rel);
      }
    }
    expect(
      violations,
      `projectTable coupled to workspaceId/workspace_id:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("dead board-reorder files stay deleted", () => {
    // KFL-366 supersession: apps/api/src/project, nav-projects.tsx,
    // hooks/*/project/, and fetchers/project/ were removed from this list —
    // they are now legitimately reused by the new organization-scoped
    // Project domain (see file header). Only the two reorder-feature files
    // that never got a KFL-366 replacement stay banned.
    const deadPaths = [
      "apps/api/src/board/controllers/reorder-projects.ts",
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
