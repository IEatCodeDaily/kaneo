/**
 * Renders the relation-type footer through the real i18n runtime to prove the
 * reported defect is gone: the "Blocked by" button showed the raw key
 * "relations.blockedBy" because tasks:relations.blockedBy had no locale entry.
 *
 * This mounts nothing from the component tree (task-relations pulls in the
 * whole query/router stack); it exercises the same t() calls through a real
 * i18next instance configured exactly like apps/web/src/lib/i18n/index.ts,
 * which is the layer that actually decides whether a key or a word is painted.
 */
import { defaultResources } from "@i18n/resources";
import i18next from "i18next";
import { beforeAll, describe, expect, it } from "vitest";

const KEY_LIKE = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)+$/;

let t: (key: string, opts?: Record<string, unknown>) => string;

beforeAll(async () => {
  const instance = i18next.createInstance();
  await instance.init({
    resources: { "en-US": defaultResources },
    lng: "en-US",
    fallbackLng: "en-US",
    ns: Object.keys(defaultResources),
    defaultNS: "common",
    interpolation: { escapeValue: false },
  });
  t = (key, opts) => instance.t(key, opts) as string;
});

describe("relation type footer labels", () => {
  // the three buttons rendered in task-relations.tsx CommandFooter
  const BUTTONS = [
    { key: "tasks:relations.related", expected: "Related" },
    { key: "tasks:relations.blocks", expected: "Blocks" },
    { key: "tasks:relations.blockedBy", expected: "Blocked by" },
  ];

  for (const { key, expected } of BUTTONS) {
    it(`${key} renders "${expected}" and not a raw key`, () => {
      const rendered = t(key);
      expect(rendered).toBe(expected);
      // the defect signature: i18next echoes the key tail when unresolved
      expect(rendered).not.toBe(key);
      expect(rendered).not.toBe(key.split(":")[1]);
      expect(rendered).not.toMatch(KEY_LIKE);
    });
  }
});

describe("relation type group headers", () => {
  // t(`tasks:relations.types.${type}`) for every persisted relation type
  const TYPES = ["blocks", "blocked_by", "related"];

  for (const type of TYPES) {
    it(`types.${type} renders prose`, () => {
      const rendered = t(`tasks:relations.types.${type}`);
      expect(rendered).not.toMatch(KEY_LIKE);
      expect(rendered).not.toContain("_");
      expect(rendered.length).toBeGreaterThan(0);
    });
  }
});

describe("list view nest + grouping labels", () => {
  it("nest preview interpolates the target title", () => {
    const rendered = t("tasks:nest.willNestUnder", { title: "Fix login" });
    expect(rendered).toContain("Fix login");
    expect(rendered).not.toContain("{{");
    expect(rendered).not.toMatch(KEY_LIKE);
  });

  it("nest tooltip interpolates the target title", () => {
    const rendered = t("tasks:nest.releaseToNest", { title: "Fix login" });
    expect(rendered).toContain("Fix login");
    expect(rendered).not.toContain("{{");
  });

  it("invalid-drop copy renders prose", () => {
    for (const key of [
      "tasks:nest.cannotNestHere",
      "tasks:nest.cannotNestReason",
    ]) {
      expect(t(key)).not.toMatch(KEY_LIKE);
    }
  });

  it("group-by options render prose", () => {
    expect(t("tasks:groupBy.none")).toBe("None");
    expect(t("tasks:groupBy.status")).toBe("Status");
    expect(t("tasks:groupBy.milestone")).toBe("Milestone");
    expect(t("tasks:gantt.noMilestone")).toBe("No milestone");
  });

  it("unknown-target fallback is prose, not a key", () => {
    const rendered = t("tasks:nest.willNestUnder", {
      title: t("tasks:nest.unknownTarget"),
    });
    expect(rendered).not.toMatch(/nest\./);
    expect(rendered).not.toContain("{{");
  });
});

describe("other previously-raw keys", () => {
  it("common:unknown and tasks:detail.close render prose", () => {
    expect(t("common:unknown")).toBe("Unknown");
    expect(t("tasks:detail.close")).not.toMatch(KEY_LIKE);
  });
});
