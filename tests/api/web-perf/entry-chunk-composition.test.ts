import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * KFL-86, fix 2: stable vendor libraries that never change between releases
 * were bundled into the app entry chunk, so every app-code edit invalidated
 * them in the browser cache. Splitting the biggest stable libraries into their
 * own long-lived chunks means the browser reuses them across deploys.
 *
 * These tests read the REAL built artifact (dist/) and pin:
 *   1. i18next must not live inside the entry chunk.
 *   2. The entry chunk must not regress past its post-fix-1 size (1150 KB).
 */

const webRoot = resolve(__dirname, "../../../apps/web");

function entryChunkName(): string {
  const html = readFileSync(join(webRoot, "dist/index.html"), "utf8");
  const m = html.match(/src="\/assets\/(index-[^"]+\.js)"/);
  if (!m) throw new Error("entry chunk not found in dist/index.html");
  return m[1];
}

describe("entry chunk composition (KFL-86)", () => {
  it("keeps i18next out of the entry chunk", () => {
    const js = readFileSync(
      join(webRoot, "dist/assets", entryChunkName()),
      "utf8",
    );
    // "i18next::" is i18next's internal logger prefix and survives minification.
    expect(js.includes("i18next::")).toBe(false);
  });

  it("entry chunk does not regress past fix-1 level (1150 KB + slack)", () => {
    const size = statSync(join(webRoot, "dist/assets", entryChunkName())).size;
    expect(size).toBeLessThan(1151 * 1024);
  });
});
