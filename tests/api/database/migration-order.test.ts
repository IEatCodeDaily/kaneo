import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const journal = JSON.parse(
  readFileSync(
    new URL("../../../apps/api/drizzle/meta/_journal.json", import.meta.url),
    "utf8",
  ),
) as { entries: { tag: string; when: number }[] };

// drizzle applies a migration only if its journal `when` is newer than the last applied one,
// so a hand-written entry with a stale `when` is silently skipped on existing databases
// while a fresh CI database still applies it.
describe("migration journal", () => {
  const sqlTags = readdirSync(
    new URL("../../../apps/api/drizzle/", import.meta.url),
  )
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.slice(0, -4))
    .sort();
  const tags = journal.entries.map((entry) => entry.tag);

  it("has exactly one entry per .sql file", () => {
    expect([...tags].sort()).toEqual(sqlTags);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("ends with the newest timestamp", () => {
    const whens = journal.entries.map((entry) => entry.when);
    expect(whens.at(-1)).toBe(Math.max(...whens));
  });
});

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
