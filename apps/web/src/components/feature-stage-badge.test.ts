import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Stage markers drifted into five hand-rolled styles; FeatureStageBadge is the only one.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

describe("FeatureStageBadge", () => {
  it("is the only way a rollout stage is rendered", () => {
    const offenders = sources(join(process.cwd(), "src")).filter((path) =>
      />\s*(\{" "\}\s*)?(Alpha|Beta|ALPHA|BETA)\s*</.test(
        readFileSync(path, "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
