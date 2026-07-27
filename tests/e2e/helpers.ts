import { readFileSync } from "node:fs";
import { expect, type Page, test as base } from "@playwright/test";

export type Fixtures = {
  baseURL: string;
  organizationId: string;
  repoId: string | null;
  repoOwner: string | null;
  repoName: string | null;
  boardId: string | null;
  issueNumber: number | null;
  pullNumber: number | null;
};

export function loadFixtures(): Fixtures {
  return JSON.parse(readFileSync("tests/e2e/.auth/fixtures.json", "utf8"));
}

/**
 * Console/pageerror capture is the whole point of this suite: the
 * "RepoTaskLinks is not defined" class of bug builds clean and only shows up as
 * a runtime ReferenceError. Any spec using this fixture fails on those.
 */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      // Network noise and provider rate limits are not app defects.
      if (/Failed to load resource|net::ERR_|status of 4\d\d|status of 5\d\d/.test(text)) {
        return;
      }
      errors.push(`console: ${text}`);
    });
    await use(errors);

    const fatal = errors.filter((error) =>
      /is not defined|is not a function|Cannot read properties|Minified React error|Rendered more hooks|undefined is not an object/.test(
        error,
      ),
    );
    expect(fatal, `Runtime errors detected:\n${fatal.join("\n")}`).toEqual([]);
  },
});

export { expect };

/** Waits for the app shell to settle instead of relying on bare timeouts. */
export async function gotoAndSettle(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toBeVisible();
  // TanStack Router + Query need a tick to resolve loaders before assertions.
  await page.waitForLoadState("networkidle").catch(() => {});
}
