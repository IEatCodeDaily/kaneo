import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("opens a repository's source URL in a new tab", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/nav-repos.tsx"),
    "utf8",
  );
  const compact = source.replace(/\s/g, "");
  expect(compact).toContain("window.open(repo.url");
  expect(compact).toContain('"_blank","noopener,noreferrer"');
});
