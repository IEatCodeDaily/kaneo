#!/usr/bin/env node
/**
 * Audit i18n key usage: find t("ns:key") calls in web source that have no
 * matching entry in i18n/en-US.json (the baseline locale).
 *
 * check.mjs verifies locale files agree with the baseline. It cannot catch a
 * key that is used in code but missing from every locale -- that renders the
 * raw key string in the UI (e.g. "relations.blockedBy").
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
const SRC = join(ROOT, "apps/web/src");
const BASELINE = join(ROOT, "i18n/en-US.json");

const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));

function flatten(obj, prefix, out) {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, path, out);
    else out.add(path);
  }
  return out;
}

// baseline is { namespace: { ...keys } } -> build "ns:a.b" set
const known = new Set();
for (const [ns, tree] of Object.entries(baseline)) {
  if (!tree || typeof tree !== "object") continue;
  for (const key of flatten(tree, "", new Set())) known.add(`${ns}:${key}`);
}

// plural suffixes i18next resolves at runtime from a base key
const PLURAL = ["_one", "_other", "_zero", "_two", "_few", "_many"];

function resolvable(key) {
  if (known.has(key)) return true;
  // plural: code uses base key, locale holds base_one/base_other
  if (PLURAL.some((s) => known.has(`${key}${s}`))) return true;
  // code already asks for a suffixed form
  for (const s of PLURAL) {
    if (key.endsWith(s) && known.has(key.slice(0, -s.length))) return true;
  }
  return false;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(full)) yield full;
  }
}

// t("ns:key") / t('ns:key') -- static literals only.
// Capture a slice of what follows so we can detect a defaultValue fallback:
// t("ns:key", { defaultValue: "..." }) still renders readable text, whereas a
// bare t("ns:key") paints the raw key into the UI.
// The tail is captured via lookahead so it is NOT consumed -- otherwise
// matchAll advances past adjacent t() calls and silently under-reports.
const STATIC =
  /\bt\(\s*["']([a-zA-Z0-9_]+:[a-zA-Z0-9_.-]+)["'](?=([\s\S]{0,240}))/g;

function hasFallback(tail) {
  // only look at the argument list of this call, not the rest of the file
  let depth = 1;
  let scope = "";
  for (const ch of tail) {
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) break;
    }
    scope += ch;
  }
  return /\bdefaultValue\s*:/.test(scope);
}
// t(`ns:prefix.${expr}`) -- dynamic tail, report prefix for manual review
const DYNAMIC = /\bt\(\s*`([a-zA-Z0-9_]+:[a-zA-Z0-9_.-]*)\$\{/g;

const missing = new Map();
const fallbackOnly = new Map();
const dynamic = new Map();

for (const file of walk(SRC)) {
  if (/\.test\.(ts|tsx)$/.test(file)) continue;
  const text = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  for (const m of text.matchAll(STATIC)) {
    if (resolvable(m[1])) continue;
    const bucket = hasFallback(m[2]) ? fallbackOnly : missing;
    if (!bucket.has(m[1])) bucket.set(m[1], []);
    bucket.get(m[1]).push(rel);
  }
  for (const m of text.matchAll(DYNAMIC)) {
    if (!dynamic.has(m[1])) dynamic.set(m[1], []);
    dynamic.get(m[1]).push(rel);
  }
}

if (missing.size === 0) {
  console.log("OK: no static t() key renders a raw key string");
} else {
  console.log(
    `BROKEN (${missing.size}) -- no locale entry and no defaultValue:`,
  );
  for (const [key, files] of [...missing].sort()) {
    console.log(`  ${key}`);
    for (const f of [...new Set(files)]) console.log(`      ${f}`);
  }
}

if (fallbackOnly.size > 0) {
  console.log(
    `\nFALLBACK-ONLY (${fallbackOnly.size}) -- readable in English via defaultValue, but untranslatable:`,
  );
  for (const [key] of [...fallbackOnly].sort()) console.log(`  ${key}`);
}

if (dynamic.size > 0) {
  console.log(`\nDYNAMIC prefixes (${dynamic.size}) -- verify tails by hand:`);
  for (const [key, files] of [...dynamic].sort()) {
    console.log(`  ${key}\${...}  <- ${[...new Set(files)].join(", ")}`);
  }
}

process.exit(missing.size === 0 ? 0 : 1);
