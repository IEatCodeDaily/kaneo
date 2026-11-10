import fs from "node:fs";
import path from "node:path";
import tablesResources from "@i18n/lazy/en-US-tables.json";
import { defaultResources } from "@i18n/resources";
import { describe, expect, it } from "vitest";

// The tables/dashboards slice ships as a lazy bundle (entry-chunk budget),
// so the resolver must see the merged view just like the runtime does.
const resources = {
  ...defaultResources,
  navigation: {
    ...defaultResources.navigation,
    ...tablesResources,
  },
} as Record<string, unknown>;

const sourceRoot = path.resolve(import.meta.dirname, "../..");
const staticTranslationPattern = /\bt\(\s*["']([^"']+)["']/g;

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(target);
    return /\.tsx?$/.test(entry.name) ? [target] : [];
  });
}

function resourceHas(key: string) {
  const [namespace, resourceKey] = key.includes(":")
    ? key.split(":", 2)
    : ["common", key];
  let value: unknown = resources[namespace];
  for (const segment of resourceKey.split(".")) {
    if (!value || typeof value !== "object" || !(segment in value))
      return false;
    value = (value as Record<string, unknown>)[segment];
  }
  return true;
}

describe("static translation keys", () => {
  it("resolves every literal t() key used by the web app", () => {
    const missing = new Set<string>();
    for (const file of walk(sourceRoot)) {
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(staticTranslationPattern)) {
        if (!resourceHas(match[1])) missing.add(match[1]);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });
});
