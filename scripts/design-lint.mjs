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
    "arbitrary text size",
    /(?<![\w-])text-\[[\d.]+(?:px|rem|em)\]/,
    "DESIGN-SYSTEM §1.5: sizes are tokens (text-xs floor 12px, text-ui, text-sm, text-xl, text-2xl)",
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
  [
    "off-scale radius",
    /(?<![\w:/-])rounded(?:-[trblse]{1,2})?(?:-(?:xl|2xl|3xl))?(?=["'`\s])/,
    "DESIGN-SYSTEM §1.6: rounded-sm/md/lg/full only",
  ],
  [
    "off-scale text size",
    /(?<![\w:/-])text-(?:lg|base|3xl|4xl|5xl)(?![\w/-])/,
    "DESIGN-SYSTEM §1.5: text-xs/ui/sm, text-xl for page/ticket titles, text-2xl for stat values",
  ],
  [
    "font-bold",
    /(?<![\w:/-])font-bold(?![\w/-])/,
    "weights are 400/500/600 (font-semibold for titles)",
  ],
  [
    "opacity text colour",
    /(?<![\w:/-])text-(?:muted-)?foreground\/\d+/,
    "use text-muted-foreground or text-faint-foreground",
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
