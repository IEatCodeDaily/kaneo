// Mechanical design rules for apps/web feature code (components + routes).
// Runs in ci.yml's lint job. Excludes components/ui/** — the
// primitives own the tokens.
//
//   node scripts/design-lint.mjs                    check
//   node scripts/design-lint.mjs --update-baseline  lower the legacy counts
//
// Every rule carries its own probes (`bad` must fire, `good` must not) and the
// probes run before every check, so a rule can never be silently dead.
//
// Two kinds of rule:
//   hard    — zero offenders, ever.
//   ratchet — legacy offenders are counted per file in design-lint-baseline.json.
//             A count may only go down: more than the baseline fails, fewer
//             fails until the baseline is lowered, and --update-baseline can
//             only lower it.
// ponytail: counts are per file, not per line — moving an offender inside a
// file passes. Switch to line-keyed entries if that ever hides a regression.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOTS = ["apps/web/src/components", "apps/web/src/routes"];
const BASELINE = path.join(process.cwd(), "scripts/design-lint-baseline.json");

// Opening tags of the named components, whole — across lines and through
// `{…}` expressions.
const openTags = (text, names) => {
  const found = [];
  const start = new RegExp(`<(?:${names})(?![\\w.])`, "g");
  for (let m = start.exec(text); m; m = start.exec(text)) {
    let i = start.lastIndex;
    let depth = 0;
    let quote = null;
    for (; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    found.push(text.slice(m.index, i + 1));
  }
  return found;
};

const classes = (pattern, keep = () => true) => {
  const global = new RegExp(pattern.source, "g");
  return (text) => [...text.matchAll(global)].filter(keep).length;
};
const tags = (names, pattern) => (text) =>
  openTags(text, names).filter((tag) => pattern.test(tag)).length;

// DESIGN-SYSTEM §1.2: 4/8/12/16/24/32, and 6px only as gap or px.
const ON_SCALE = new Set(["0", "1", "2", "3", "4", "6", "8"]);
const spacingOnScale = ([, property, step]) =>
  ON_SCALE.has(step) || (step === "1.5" && /^(?:gap|px)/.test(property));

const RULES = [
  {
    name: "arbitrary text size",
    why: "sizes are tokens: text-xs (12px floor), text-ui, text-sm, text-xl, text-2xl",
    count: classes(/(?<![\w-])text-\[[\d.]+(?:px|rem|em)\]/),
    bad: ['"text-[11px]"', '"text-[0.625rem]"'],
    good: ['"text-xs"', '"text-[var(--x)]"'],
  },
  {
    name: "text-md is not a Tailwind class",
    why: "use text-sm (14px) or text-ui (13px)",
    count: classes(/\btext-md\b/),
    bad: ['"text-md"'],
    good: ['"text-sm"'],
  },
  {
    name: "stray arbitrary radius",
    why: "radii are tokens: rounded-sm/md/lg (4/6/10)",
    count: classes(/rounded-\[\d+px\]/),
    bad: ['"rounded-[5px]"'],
    good: ['"rounded-md"'],
  },
  {
    name: "off-scale radius",
    why: "rounded-sm/md/lg/full only",
    count: classes(
      /(?<![\w:/-])rounded(?:-[trblse]{1,2})?(?:-(?:xl|2xl|3xl))?(?=["'`\s])/,
    ),
    bad: ['"rounded"', '"rounded-xl"', '"rounded-t-2xl "'],
    good: ['"rounded-lg"', '"rounded-full"', '"rounded-t-md"'],
  },
  {
    name: "off-scale text size",
    why: "text-xs/ui/sm, text-xl for page and ticket titles, text-2xl for stat values",
    count: classes(/(?<![\w:/-])text-(?:lg|base|3xl|4xl|5xl)(?![\w/-])/),
    bad: ['"text-lg"', '"text-base"'],
    good: ['"text-sm"', '"text-xl"'],
  },
  {
    name: "font-bold",
    why: "weights are 400/500/600 (font-semibold for titles)",
    count: classes(/(?<![\w:/-])font-bold(?![\w/-])/),
    bad: ['"font-bold"'],
    good: ['"font-semibold"'],
  },
  {
    name: "opacity text colour",
    why: "use text-muted-foreground or text-faint-foreground",
    count: classes(/(?<![\w:/-])text-(?:muted-)?foreground\/\d+/),
    bad: ['"text-foreground/60"', '"text-muted-foreground/70"'],
    good: ['"text-muted-foreground"'],
  },
  {
    name: "overlay slot restyled",
    why: "Dialog/AlertDialog/Sheet own their inset, header and footer: use size / inset / visuallyHidden, never className",
    count: tags(
      "(?:Dialog|AlertDialog|Sheet)(?:Content|Popup|Header|Footer)",
      /\sclassName=/,
    ),
    bad: [
      '<DialogContent className="max-w-md p-0">',
      '<SheetHeader\n  className="px-4">',
      '<AlertDialogFooter className={cn("gap-3")}>',
    ],
    good: [
      '<DialogContent size="sm" inset="none">',
      "<DialogHeader visuallyHidden>",
      '<DialogTitle className="truncate">',
    ],
  },
  {
    name: "surface padding override",
    why: 'Popover and Card own their padding: use inset="panel" / inset="none"',
    count: tags(
      "(?:Popover(?:Content|Popup)|Card(?:Header|Panel|Content|Footer)|CardFrame(?:Header|Footer)|Frame(?:Panel|Header|Footer))",
      /(?<![\w-])!?p[xytblrse]?-[\w[(]/,
    ),
    bad: [
      '<PopoverContent className="w-64 p-0" align="start">',
      '<CardPanel className="px-6">',
      '<CardContent\n  className="flex pt-0">',
    ],
    good: [
      '<PopoverContent inset="panel" className="w-64">',
      '<CardPanel inset="none" className="flex gap-4 divide-y">',
    ],
  },
  {
    name: "arbitrary spacing",
    why: "spacing is the 4px scale: 1/2/3/4/6/8",
    ratchet: true,
    count: classes(
      /(?<![\w-])-?(?:p[xytblrse]?|m[xytblrse]?|gap(?:-[xy])?|space-[xy])-\[[\d.]+(?:px|rem|em)\]/,
    ),
    bad: ['"px-[7px]"', '"ml-[4.5rem]"'],
    good: ['"px-2"', '"w-[7px]"'],
  },
  {
    name: "off-scale spacing",
    why: "spacing steps are 1/2/3/4/6/8 (4–32px); 1.5 only as gap-1.5 or px-1.5 (icon to label, chip)",
    ratchet: true,
    count: classes(
      /(?<![\w-])-?(p[xytblrse]?|m[xytblrse]?|gap(?:-[xy])?|space-[xy])-(\d+(?:\.\d+)?)(?![\w.%/-])/,
      (match) => !spacingOnScale(match),
    ),
    bad: ['"p-5"', '"gap-2.5"', '"sm:py-0.5"', '"-mx-7"', '"mt-1.5"', '"p-12"'],
    good: ['"p-4"', '"gap-1.5"', '"px-1.5"', '"scroll-py-5"', '"top-5"'],
  },
  {
    name: "arbitrary size",
    why: "control and scaffold heights are tokens (24/28/32, 44/40/32); widths use the spacing scale",
    ratchet: true,
    count: classes(
      /(?<![\w-])(?:min-|max-)?(?:h|w|size)-\[[\d.]+(?:px|rem|em)\]/,
    ),
    bad: ['"h-[34px]"', '"max-w-[446px]"'],
    good: ['"h-8"', '"max-h-[70dvh]"', '"w-(--anchor-width)"'],
  },
  {
    name: "hand-rolled control",
    why: "use ui/button, ui/input, ui/textarea, ui/select, ui/checkbox — they carry height, radius, focus ring and the touch target",
    ratchet: true,
    count: classes(/<(?:button|input|select|textarea)(?![\w-])/),
    bad: ['<button type="button">', "<input\n  value={x} />"],
    good: ["<Button>", '<Input value="x" />', "<buttonGroup>"],
  },
];

// Probes first: a rule that no longer fires on its own bad sample is a bug.
const dead = [];
for (const rule of RULES) {
  for (const sample of rule.bad)
    if (rule.count(sample) === 0)
      dead.push(`${rule.name}: missed ${JSON.stringify(sample)}`);
  for (const sample of rule.good)
    if (rule.count(sample) !== 0)
      dead.push(`${rule.name}: false positive on ${JSON.stringify(sample)}`);
}
if (dead.length > 0) {
  console.error(`design-lint: ${dead.length} probe failure(s)`);
  for (const line of dead) console.error(`  ${line}`);
  process.exit(2);
}

const skip = (entry) =>
  entry.name === "ui" ||
  entry.name.startsWith("node_modules") ||
  /\.(test|spec)\.[tj]sx?$/.test(entry.name);

// counts[rule][file] = offenders
const counts = Object.fromEntries(RULES.map((rule) => [rule.name, {}]));
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skip(entry)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.[tj]sx?$/.test(entry.name)) {
      const text = readFileSync(full, "utf8");
      const file = path.relative(process.cwd(), full);
      for (const rule of RULES) {
        const n = rule.count(text);
        if (n > 0) counts[rule.name][file] = n;
      }
    }
  }
};
for (const root of ROOTS) walk(path.join(process.cwd(), root));

const ratchets = RULES.filter((rule) => rule.ratchet);
const readBaseline = () =>
  existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : null;

if (process.argv.includes("--update-baseline")) {
  // Shrink-only: an existing baseline can lose offenders, never gain them.
  const before = readBaseline();
  const next = {};
  for (const rule of ratchets) {
    next[rule.name] = {};
    for (const file of Object.keys(counts[rule.name]).sort()) {
      const now = counts[rule.name][file];
      const kept = before ? Math.min(now, before[rule.name]?.[file] ?? 0) : now;
      if (kept > 0) next[rule.name][file] = kept;
    }
  }
  writeFileSync(BASELINE, `${JSON.stringify(next, null, "\t")}\n`);
  console.log("design-lint: baseline written (counts can only go down)");
}

const allowed = readBaseline() ?? {};
const offenders = [];
const stale = [];
for (const rule of RULES) {
  const legacy = rule.ratchet ? (allowed[rule.name] ?? {}) : {};
  for (const file of new Set([
    ...Object.keys(counts[rule.name]),
    ...Object.keys(legacy),
  ])) {
    const now = counts[rule.name][file] ?? 0;
    const was = legacy[file] ?? 0;
    if (now > was)
      offenders.push(
        `${file} — ${rule.name}: ${now}${rule.ratchet ? ` (baseline ${was})` : ""}\n      ${rule.why}`,
      );
    else if (now < was) stale.push(`${file} — ${rule.name}: ${was} → ${now}`);
  }
}

if (offenders.length > 0) {
  console.error(`design-lint: ${offenders.length} offender(s)`);
  for (const line of offenders) console.error(`  ${line}`);
}
if (stale.length > 0) {
  console.error(
    `design-lint: ${stale.length} baseline count(s) too high — run: node scripts/design-lint.mjs --update-baseline`,
  );
  for (const line of stale) console.error(`  ${line}`);
}
if (offenders.length > 0 || stale.length > 0) process.exit(1);

const legacyTotal = ratchets.reduce(
  (sum, rule) =>
    sum + Object.values(allowed[rule.name] ?? {}).reduce((a, b) => a + b, 0),
  0,
);
console.log(
  `design-lint: clean (${RULES.length} rules, ${legacyTotal} legacy offenders left in the baseline)`,
);
