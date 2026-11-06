import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const journal = JSON.parse(
  readFileSync(
    new URL("../../../apps/api/drizzle/meta/_journal.json", import.meta.url),
    "utf8",
  ),
) as { entries: { tag: string; when: number }[] };

describe("notification secret migration dependency", () => {
  it("creates notification preferences before cleaning their secrets", () => {
    const tags = journal.entries.map((entry) => entry.tag);
    expect(tags.indexOf("0025_early_owl")).toBeLessThan(
      tags.indexOf("0026_encrypt_notification_preference_secrets"),
    );
  });

  it("preserves published timestamps for already-migrated databases", () => {
    expect(
      journal.entries.find((entry) => entry.tag === "0025_early_owl")?.when,
    ).toBe(1775156843372);
    expect(
      journal.entries.find(
        (entry) => entry.tag === "0026_encrypt_notification_preference_secrets",
      )?.when,
    ).toBe(1775102400000);
  });
});
