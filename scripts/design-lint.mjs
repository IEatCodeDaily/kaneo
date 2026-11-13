// Design v3 S8: a CI grep over the app source that keeps the design system's
// mechanical rules from regressing. Runs in ui-render.yml's web-checks job.
// Excludes components/ui/** — the primitives own the tokens.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOTS = [
  path.join(process.cwd(), "apps/web/src/components"),
  path.join(process.cwd(), "apps/web/src/routes"),
];

// [rule, pattern, why]
const RULES = [
  [
    "sub-12px text",
    /text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]/,
    "the floor is text-xs (12px); smaller text is unreadable and fails a11y",
  ],
  [
    "text-md is not a Tailwind class",
    /\btext-md\b/,
    "use text-sm (14px) or text-ui (13px)",
  ],
  [
    "stray arbitrary radius",
    /rounded-\[\d+px\]/,
    "radii are tokens: rounded-sm/md/lg (4/6/10)",
  ],
];

const skip = (entry) =>
  entry.name === "ui" ||
  entry.name.startsWith("node_modules") ||
  /\.(test|spec)\.[tj]sx?$/.test(entry.name);

const offenders = [];
const walk = (dir, rootLabel) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skip(entry)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, rootLabel);
    else if (/\.[tj]sx?$/.test(entry.name)) {
      const text = readFileSync(full, "utf8");
      for (const [rule, pattern] of RULES) {
        if (pattern.test(text)) {
          offenders.push(
            `${rootLabel}:${path.relative(process.cwd(), full)} — ${rule}`,
          );
        }
      }
    }
  }
};

for (const root of ROOTS) {
  walk(root, "design-lint");
}

if (offenders.length > 0) {
  console.error(`design-lint: ${offenders.length} offender(s)`);
  for (const line of [...new Set(offenders)]) console.error(`  ${line}`);
  process.exit(1);
}
console.log("design-lint: clean");
