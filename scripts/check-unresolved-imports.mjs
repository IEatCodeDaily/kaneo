#!/usr/bin/env node
/**
 * Resolve every `@/` import reachable from the web app's committed tree and
 * report the ones that do not exist.
 *
 * Committing a file that imports an untracked sibling produces a tree that
 * typechecks locally (the file is on disk) but fails `vite build` on a clean
 * checkout. Iterating one build failure at a time is slow; this finds them all.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".", "apps/web/src");
// "" first: an import may already carry its extension (`@/store/board.ts`),
// which resolves fine but would look missing if we only ever appended.
const EXTS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx", ".js", ".jsx"];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const missing = new Map();
for (const file of walk(root)) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/from\s+"(@\/[^"]+)"/g)) {
    const spec = m[1].slice(2);
    const found = EXTS.some((ext) => {
      try {
        return statSync(join(root, spec + ext)).isFile();
      } catch {
        return false;
      }
    });
    if (!found) {
      const rel = file.slice(root.length + 1);
      missing.set(spec, [...(missing.get(spec) ?? []), rel]);
    }
  }
}

if (missing.size === 0) {
  console.log("OK: every @/ import resolves");
  process.exit(0);
}
console.log(`MISSING (${missing.size}):`);
for (const [spec, importers] of [...missing].sort()) {
  console.log(`  @/${spec}`);
  for (const i of [...new Set(importers)]) console.log(`      <- ${i}`);
}
process.exit(1);
