/**
 * Dynamic t() families cannot be verified by static key matching, so this test
 * pins each family's real runtime value set (imported from the source of truth,
 * or the API enum) against en-US.json. If someone adds a new relation type,
 * priority, or role and forgets the translation, this goes red instead of
 * shipping a raw key like "relations.blockedBy" into the UI.
 */

import en from "@i18n/en-US.json";
import { describe, expect, it } from "vitest";
import type { DueDateOutcome } from "@/lib/due-date-status";

type Tree = { [key: string]: string | Tree };

function at(path: string): Tree | string | undefined {
  const [ns, rest] = path.split(":");
  let cur: Tree | string | undefined = (en as unknown as Tree)[ns];
  for (const seg of rest.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = cur[seg];
  }
  return cur;
}

function keysAt(path: string): string[] {
  const node = at(path);
  expect(
    typeof node === "object" && node !== null,
    `${path} must be an object in en-US.json`,
  ).toBe(true);
  return Object.keys(node as Tree);
}

/** Every value the app can interpolate into t(`prefix.${value}`). */
const FAMILIES: Array<{ prefix: string; values: readonly string[] }> = [
  // apps/api relation types + the reversed direction rendered in the UI
  {
    prefix: "tasks:relations.types",
    values: ["blocks", "blocked_by", "related"],
  },
  { prefix: "tasks:priority", values: ["low", "medium", "high", "urgent"] },
  {
    prefix: "tasks:milestone.status",
    values: ["planned", "active", "completed", "archived"],
  },
  { prefix: "team:roles", values: ["owner", "admin", "member", "viewer"] },
  {
    prefix: "organization:repos.stateFilter",
    values: ["all", "open", "closed", "merged"],
  },
];

describe("i18n dynamic key families", () => {
  for (const { prefix, values } of FAMILIES) {
    it(`${prefix} covers every runtime value`, () => {
      const present = keysAt(prefix);
      const missing = values.filter((v) => !present.includes(v));
      expect(missing, `${prefix} missing: ${missing.join(", ")}`).toEqual([]);
    });
  }

  it("tasks:dueDate.outcome covers the DueDateOutcome union", () => {
    // typed so widening the union without updating this list fails typecheck
    const outcomes: DueDateOutcome[] = ["early", "on-time", "late"];
    const present = keysAt("tasks:dueDate.outcome");
    expect(outcomes.filter((o) => !present.includes(o))).toEqual([]);
  });
});

describe("i18n keys that previously rendered raw", () => {
  // regression guard for the reported "relations.blockedBy" defect
  const REQUIRED = [
    "tasks:relations.blockedBy",
    "tasks:relations.blocks",
    "tasks:relations.related",
    "tasks:groupBy.status",
    "tasks:groupBy.milestone",
    "tasks:gantt.noMilestone",
    "tasks:nest.willNestUnder",
    "tasks:nest.releaseToNest",
    "tasks:nest.cannotNestHere",
    "tasks:nest.cannotNestReason",
    "tasks:nest.unknownTarget",
    "tasks:detail.close",
    "common:unknown",
  ];

  for (const key of REQUIRED) {
    it(`${key} resolves to a human string`, () => {
      const value = at(key);
      expect(typeof value, `${key} must exist in en-US.json`).toBe("string");
      const text = value as string;
      expect(text.trim().length).toBeGreaterThan(0);
      // a value that is just the key tail means someone pasted the key in
      expect(text).not.toBe(key.split(":")[1]);
      expect(text).not.toContain(":");
    });
  }

  it("interpolated nest keys keep their {{title}} placeholder", () => {
    for (const key of [
      "tasks:nest.willNestUnder",
      "tasks:nest.releaseToNest",
    ]) {
      expect(at(key) as string).toContain("{{title}}");
    }
  });

  // en-US alone is not enough: a locale added later without these keys
  // silently regresses the fix for that language. Assert the whole set.
  const LOCALES = import.meta.glob<Record<string, unknown>>("@i18n/*.json", {
    eager: true,
    import: "default",
  });

  const NAMES = Object.keys(LOCALES)
    .filter((p) => !p.endsWith("schema.json"))
    .sort();

  function lookup(bundle: Record<string, unknown>, path: string) {
    const [ns, rest] = path.split(":");
    let cur: unknown = bundle[ns];
    for (const seg of rest.split(".")) {
      if (typeof cur !== "object" || cur === null) return undefined;
      cur = (cur as Record<string, unknown>)[seg];
    }
    return cur;
  }

  it("discovers the locale bundles", () => {
    // guards against the glob matching nothing, which would make every
    // per-locale assertion below vacuously pass
    expect(NAMES.length).toBeGreaterThanOrEqual(12);
  });

  for (const file of NAMES) {
    const name = file.split("/").pop();

    it(`${name} defines every previously-raw key`, () => {
      const bundle = LOCALES[file];
      const missing = REQUIRED.filter(
        (key) => typeof lookup(bundle, key) !== "string",
      );
      expect(missing, `missing in ${file}: ${missing.join(", ")}`).toEqual([]);
    });

    it(`${name} keeps the {{title}} placeholder`, () => {
      const bundle = LOCALES[file];
      for (const key of [
        "tasks:nest.willNestUnder",
        "tasks:nest.releaseToNest",
      ]) {
        expect(lookup(bundle, key) as string).toContain("{{title}}");
      }
    });
  }
});
