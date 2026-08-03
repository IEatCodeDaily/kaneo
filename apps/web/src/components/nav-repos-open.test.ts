import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\s/g, "");

it("opens the repository context-menu action at the source URL", () => {
  const navRepos = source("src/components/nav-repos.tsx");
  const contextMenu = navRepos.slice(navRepos.indexOf("<ContextMenuContent"));

  expect(contextMenu).toContain("href={repo.url}");
  expect(contextMenu).toContain('target="_blank"');
  expect(contextMenu).toContain('rel="noopenernoreferrer"');
  expect(contextMenu).not.toContain("onClick={()=>openRepo(repo.id)}");
});

it("links the repository header name to the source URL", () => {
  const repoLayout = source("src/components/common/repo-layout.tsx");
  const headerLink = repoLayout.slice(repoLayout.indexOf("<aaria-label="));

  expect(headerLink).toContain("href={repo.url}");
  expect(headerLink).toContain('target="_blank"');
  expect(headerLink).toContain('rel="noopenernoreferrer"');
  expect(headerLink).toContain("aria-label=");
  expect(headerLink).toContain("inanewtab");
});
