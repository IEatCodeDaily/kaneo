// Mechanical design rules for every class string under apps/web/src.
// Runs in ci.yml's lint job.
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
//             More than a file's count fails; fewer fails until the baseline
//             is lowered. --update-baseline rewrites the counts only when no
//             rule's total grew, so moving code between files passes and new
//             debt does not. A rule with no key in the baseline is new and is
//             seeded once. A missing baseline is an error, never regenerated.
// In components/ui every style rule is a ratchet: the primitives carry legacy
// off-token values, and a primitive is not a place to park a class the lint
// rejects in feature code.
// ponytail: counts are per file, not per line, and the update compares rule
// totals — an offender fixed in one place can be spent in another. Switch to
// line-keyed entries if that ever hides a regression.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = "apps/web/src";
const UI = /^apps\/web\/src\/components\/ui\//;
const BASELINE = path.join(process.cwd(), "scripts/design-lint-baseline.json");

// Index of the `>` that closes the opening tag whose name ends at `from` —
// across lines and through `{…}` expressions.
const tagEnd = (text, from) => {
  let i = from;
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
  return i;
};

// Opening tags of the named components, whole.
const openTags = (text, names) => {
  const found = [];
  const start = new RegExp(`<(?:${names})(?![\\w.])`, "g");
  for (let m = start.exec(text); m; m = start.exec(text))
    found.push(text.slice(m.index, tagEnd(text, start.lastIndex) + 1));
  return found;
};

// Host elements that sit directly inside a padded Dialog/AlertDialog/Sheet
// content (or its transparent <form>) and pad or bleed sideways without being
// a box of their own. `inset="none"` and the chrome-less `variant="media"`
// have no inset to fight. The enclosing element is read from indentation, which
// `biome ci` keeps exact; `{cond && (` and `.map(` lines are transparent.
// ponytail: components (<ScrollArea className="px-6">) are not checked, only
// host elements. Add them if a component is ever used to re-pad a body.
const OVERLAY_CONTENT =
  /^<(?:Dialog|AlertDialog|Sheet)(?:Content|Popup)(?![\w.])/;
const SIDEWAYS = /(?<![\w-])(?:-m[xytblrse]?|p[xselr]?)-(?:\d|px\b|\[)/;
const OWN_BOX = /(?<![\w-])(?:border|bg-|shadow|ring)/;
const repadded = (text) => {
  const lines = text.split("\n");
  const at = [];
  let offset = 0;
  for (const line of lines) {
    at.push(offset);
    offset += line.length + 1;
  }
  const indent = (i) => lines[i].length - lines[i].trimStart().length;
  const tag = (i) =>
    text.slice(at[i], tagEnd(text, at[i] + lines[i].indexOf("<") + 1) + 1);
  // line of the nearest enclosing element's opening tag, or -1
  const parent = (i) => {
    let level = indent(i);
    for (let k = i - 1; k >= 0; k--) {
      const line = lines[k].trimStart();
      if (line === "" || indent(k) >= level) continue;
      level = indent(k);
      if (/^<[A-Za-z]/.test(line)) return k;
      // a lone `>` ends a multi-line opening tag that starts at this level
      if (line === ">")
        for (k--; k >= 0; k--)
          if (indent(k) === level && /^<[A-Za-z]/.test(lines[k].trimStart()))
            return k;
    }
    return -1;
  };
  const padded = (k) =>
    k >= 0 &&
    OVERLAY_CONTENT.test(lines[k].trimStart()) &&
    !/\s(?:inset="none"|variant="media")/.test(tag(k));
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!/^<[a-z]/.test(lines[i].trimStart())) continue;
    const own = tag(i);
    if (!SIDEWAYS.test(own) || OWN_BOX.test(own)) continue;
    const up = parent(i);
    if (
      padded(up) ||
      (up >= 0 &&
        /^<form(?![\w.])/.test(lines[up].trimStart()) &&
        padded(parent(up)))
    )
      n++;
  }
  return n;
};

// Comments carry no classes: blank JSX comments, line-leading block comments
// and line-leading // lines, keeping offsets and newlines.
const strip = (text) =>
  text.replace(
    /\{\/\*[\s\S]*?\*\/\}|^[ \t]*\/\*[\s\S]*?\*\/|^[ \t]*\/\/.*$/gm,
    (comment) => comment.replace(/[^\n]/g, " "),
  );

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
      /(?<![\w/-])rounded(?:-[trblse]{1,2})?(?:-(?:xl|2xl|3xl))?(?=["'`\s!])/,
    ),
    bad: [
      '"rounded"',
      '"rounded-xl"',
      '"rounded-t-2xl "',
      '"sm:rounded-xl"',
      '"[&>a]:rounded-xl!"',
    ],
    good: [
      '"rounded-lg"',
      '"rounded-full"',
      '"rounded-t-md"',
      '"before:rounded-[calc(var(--radius-lg)-1px)]"',
    ],
  },
  {
    name: "off-scale text size",
    why: "text-xs/ui/sm, text-xl for page and ticket titles, text-2xl for stat values",
    count: classes(
      /(?<![\w/-])(?<!pointer-coarse:)text-(?:lg|base|3xl|4xl|5xl)(?![\w/-])/,
    ),
    bad: ['"text-lg"', '"text-base"', '"md:text-lg"', '"[&_input]:text-base"'],
    // 16px on touch stops iOS zooming into a focused field
    good: ['"text-sm"', '"text-xl"', '"pointer-coarse:text-base"'],
  },
  {
    name: "font-bold",
    why: "weights are 400/500/600 (font-semibold for titles)",
    count: classes(/(?<![\w/-])font-bold(?![\w/-])/),
    bad: ['"font-bold"', '"hover:font-bold"'],
    good: ['"font-semibold"'],
  },
  {
    name: "opacity text colour",
    why: "use text-muted-foreground or text-faint-foreground",
    count: classes(/(?<![\w/-])text-(?:muted-|faint-)?foreground\/(?:\d|\[)/),
    bad: [
      '"text-foreground/60"',
      '"text-muted-foreground/70"',
      '"hover:text-foreground/80"',
      '"text-faint-foreground/50"',
      '"text-foreground/[0.6]"',
    ],
    good: [
      '"text-muted-foreground"',
      '"text-popover-foreground/70"',
      "  /* text-foreground/60 was unreadable */",
    ],
  },
  {
    name: "overlay slot restyled",
    why: "Dialog/AlertDialog/Sheet/CommandDialog own their inset, header and footer: use size / inset / visuallyHidden, never className",
    featureOnly: true,
    count: tags(
      "(?:(?:Dialog|AlertDialog|Sheet|CommandDialog)(?:Content|Popup|Header|Footer)|CommandFooter)",
      /\sclassName=/,
    ),
    bad: [
      '<DialogContent className="max-w-md p-0">',
      '<CommandDialogPopup className="h-105 max-w-3xl">',
      '<CommandFooter className="px-5">',
      '<SheetHeader\n  className="px-4">',
      '<AlertDialogFooter className={cn("gap-3")}>',
    ],
    good: [
      '<DialogContent size="sm" inset="none">',
      '<CommandDialogPopup size="lg" instant>',
      "<DialogHeader visuallyHidden>",
      '<DialogContent\n  {/* don\'t pass className= here */}\n  size="sm">',
      '<DialogTitle className="truncate">',
    ],
  },
  {
    name: "overlay body re-padded",
    why: "the content is already inset 16px: a direct child must not pad or bleed sideways. Group rows in a plain <div>; a full-bleed band uses -mx-(--overlay-inset) px-(--overlay-inset); a box of its own (border or fill) may pad",
    featureOnly: true,
    count: repadded,
    bad: [
      '<DialogContent>\n  <div className="grid gap-4 px-6">\n  </div>\n</DialogContent>',
      '<SheetContent\n  size="sm"\n>\n  {open && (\n    <div className="-mx-4">\n    </div>\n  )}\n</SheetContent>',
      '<DialogContent>\n  <form onSubmit={save}>\n    <div\n      className="p-6"\n    >\n    </div>\n  </form>\n</DialogContent>',
    ],
    good: [
      '<DialogContent>\n  <div className="space-y-2">\n    <div className="px-2">\n    </div>\n  </div>\n</DialogContent>',
      '<DialogContent>\n  <ul className="rounded-md border p-2">\n  </ul>\n</DialogContent>',
      '<DialogContent>\n  <div className="-mx-(--overlay-inset) px-(--overlay-inset)">\n  </div>\n</DialogContent>',
      '<DialogContent inset="none">\n  <div className="px-4">\n  </div>\n</DialogContent>',
      '<DialogPopup variant="media">\n  <div className="flex p-4">\n  </div>\n</DialogPopup>',
      '<Card>\n  <div className="px-6">\n  </div>\n</Card>',
    ],
  },
  {
    name: "surface padding override",
    why: 'Popover and Card own their padding: use inset="panel" / inset="none"',
    featureOnly: true,
    count: tags(
      "(?:Popover(?:Content|Popup)|Card(?:Header|Panel|Content|Footer)|CardFrame(?:Header|Footer)|Frame(?:Panel|Header|Footer))",
      /(?<![\w-])!?p[xytblrse]?-(?:\d|px\b|\[|\()|style=\{\{[^}]*\bpadding/,
    ),
    bad: [
      '<PopoverContent className="w-64 p-0" align="start">',
      '<CardPanel className="p-(--gutter)">',
      "<CardPanel style={{ padding: 0 }}>",
      '<CardPanel className="px-6">',
      '<CardContent\n  className="flex pt-0">',
    ],
    good: [
      '<PopoverContent inset="panel" className="w-64">',
      '<CardPanel inset="none" className="flex gap-4 divide-y">',
      '<PopoverContent aria-label="Pick p-value" className="w-64">',
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
    featureOnly: true,
    count: classes(/<(?:button|input|select|textarea)(?![\w-])/),
    bad: ['<button type="button">', "<input\n  value={x} />"],
    good: [
      "<Button>",
      '<Input value="x" />',
      "<buttonGroup>",
      "// a raw <button> is banned",
      "{/* <input> */}",
    ],
  },
];

// Probes first: a rule that no longer fires on its own bad sample is a bug.
const dead = [];
for (const rule of RULES) {
  for (const sample of rule.bad)
    if (rule.count(strip(sample)) === 0)
      dead.push(`${rule.name}: missed ${JSON.stringify(sample)}`);
  for (const sample of rule.good)
    if (rule.count(strip(sample)) !== 0)
      dead.push(`${rule.name}: false positive on ${JSON.stringify(sample)}`);
}
if (dead.length > 0) {
  console.error(`design-lint: ${dead.length} probe failure(s)`);
  for (const line of dead) console.error(`  ${line}`);
  process.exit(2);
}

const skip = (entry) =>
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
      const text = strip(readFileSync(full, "utf8"));
      const file = path.relative(process.cwd(), full);
      for (const rule of RULES) {
        if (rule.featureOnly && UI.test(file)) continue;
        const n = rule.count(text);
        if (n > 0) counts[rule.name][file] = n;
      }
    }
  }
};
walk(path.join(process.cwd(), ROOT));

const isRatchet = (rule, file) => rule.ratchet || UI.test(file);
const total = (byFile = {}) => Object.values(byFile).reduce((a, b) => a + b, 0);
if (!existsSync(BASELINE)) {
  console.error(
    "design-lint: scripts/design-lint-baseline.json is missing — restore it from git; it is never regenerated",
  );
  process.exit(2);
}
const readBaseline = () => JSON.parse(readFileSync(BASELINE, "utf8"));

if (process.argv.includes("--update-baseline")) {
  const before = readBaseline();
  const next = {};
  const grew = [];
  for (const rule of RULES) {
    const now = Object.fromEntries(
      Object.entries(counts[rule.name])
        .filter(([file]) => isRatchet(rule, file))
        .sort(([a], [b]) => (a < b ? -1 : 1)),
    );
    const was = before[rule.name];
    // No key yet: a new rule, seeded once. Otherwise the total may not grow.
    if (was !== undefined && total(now) > total(was)) {
      grew.push(`${rule.name}: ${total(was)} → ${total(now)}`);
      next[rule.name] = was;
    } else next[rule.name] = now;
  }
  writeFileSync(BASELINE, `${JSON.stringify(next, null, "\t")}\n`);
  if (grew.length > 0) {
    console.error(
      `design-lint: ${grew.length} rule(s) not updated — a rule's total can only go down`,
    );
    for (const line of grew) console.error(`  ${line}`);
  } else console.log("design-lint: baseline written");
}

const allowed = readBaseline();
const offenders = [];
const stale = [];
for (const rule of RULES) {
  const legacy = allowed[rule.name] ?? {};
  for (const file of new Set([
    ...Object.keys(counts[rule.name]),
    ...Object.keys(legacy),
  ])) {
    const ratchet = isRatchet(rule, file);
    const now = counts[rule.name][file] ?? 0;
    const was = ratchet ? (legacy[file] ?? 0) : 0;
    if (now > was)
      offenders.push(
        `${file} — ${rule.name}: ${now}${ratchet ? ` (baseline ${was})` : ""}\n      ${rule.why}`,
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

const legacyTotal = RULES.reduce(
  (sum, rule) => sum + total(allowed[rule.name]),
  0,
);
console.log(
  `design-lint: clean (${RULES.length} rules, ${legacyTotal} legacy offenders left in the baseline)`,
);
