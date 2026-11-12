// Seed a fresh Kaneo (built image + Postgres) through its real API, then screenshot real pages.
// node tests/ui-render/render.mjs   (BASE=http://localhost:5173 OUT=shots)
// Desktop 1440x900 dark+light, phone 390x844 dark. Fails on page errors, error-boundary text, empty pages.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, request } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:5173";
const OUT = process.env.OUT ?? "shots";
const PAGES = (process.env.PAGES ?? "").split(",").filter(Boolean);
mkdirSync(OUT, { recursive: true });
const BAD = ["This view failed", "unexpected error", "Something went wrong"];

async function healthy() {
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("api never became healthy");
}

async function seed(api) {
  const post = async (path, data) => {
    const r = await api.post(`${BASE}/api${path}`, {
      data,
      headers: { Origin: BASE },
    });
    const body = await r.text();
    if (!r.ok())
      throw new Error(`POST ${path} -> ${r.status()} ${body.slice(0, 300)}`);
    return body ? JSON.parse(body) : {};
  };
  await post("/auth/sign-up/email", {
    email: "render@local.test",
    password: "render-password-123",
    name: "Ayu Saraswati",
  });
  // the first user is promoted to admin after insert; sign in again so the session carries the role
  await post("/auth/sign-in/email", {
    email: "render@local.test",
    password: "render-password-123",
  });
  const org = await post("/auth/organization/create", {
    name: "Noovoleum",
    slug: "noov",
  });
  await post("/auth/organization/set-active", { organizationId: org.id });
  await post("/auth/organization/update", {
    organizationId: org.id,
    data: { tablesEnabled: true },
  });
  const board = await post("/board", {
    name: "Pilot line",
    organizationId: org.id,
    icon: "Rocket",
    slug: "KFL",
  });
  for (const [title, status, priority] of [
    ["Filter housing leak on line 2", "in-progress", "high"],
    ["QC retry policy for failed batches", "to-do", "medium"],
    ["Gasket torque checklist", "in-review", "low"],
    ["Supplier audit notes", "done", "no-priority"],
  ])
    await post(`/task/${board.id}`, {
      title,
      description: "seeded",
      status,
      priority,
    });
  const tbl = await post(`/data-table/organization/${org.id}`, {
    name: "Pilot batch log",
  });
  const f = {};
  for (const [name, type, options] of [
    ["Batch", "text"],
    [
      "Stage",
      "select",
      {
        choices: [
          ["Mixing", "#06b6d4"],
          ["Curing", "#ec4899"],
          ["In QA", "#f59e0b"],
          ["Done", "#22c55e"],
        ].map(([label, color]) => ({ id: label, label, color })),
      },
    ],
    ["Cost", "currency", { code: "IDR" }],
    ["Start date", "date"],
    ["Note", "longtext"],
  ])
    f[name] = await post(
      `/data-table/organization/${org.id}/${tbl.id}/fields`,
      options ? { name, type, options } : { name, type },
    );
  for (const [i, [batch, stage, cost]] of [
    ["PB-1042 Filter test A", "Mixing", 3180000],
    ["PB-1043 Hardener batch D", "Curing", 2450000],
    ["PB-1044 Solvent wash C", "Done", 1725000],
    ["PB-1045 Fiber layup D", "In QA", 4100000],
  ].entries())
    await post(`/data-table/organization/${org.id}/${tbl.id}/rows`, {
      values: {
        [f.Batch.id]: batch,
        [f.Stage.id]: stage,
        [f.Cost.id]: cost,
        [f["Start date"].id]: `2026-11-${String(10 - i).padStart(2, "0")}`,
        [f.Note.id]: i === 0 ? "Retest after gasket swap" : "",
      },
    });
  return { org, board, tbl };
}

await healthy();
const api = await request.newContext();
const { org, board, tbl } = await seed(api);
const state = await api.storageState();
const slug = org.slug;
let pages = {
  board: `/dashboard/organization/${slug}/board/${board.slug ?? "KFL"}/board`,
  "my-tickets": `/dashboard/organization/${slug}/my-tasks`,
  table: `/dashboard/organization/${slug}/table/${tbl.id}`,
  settings: "/dashboard/settings/account/authentication",
};
if (PAGES.length)
  pages = Object.fromEntries(
    Object.entries(pages).filter(([k]) => PAGES.includes(k)),
  );

const browser = await chromium.launch();
const checks = {};
for (const [theme, tag, viewport, scale] of [
  ["dark", "desktop", { width: 1440, height: 900 }, 1],
  ["light", "desktop", { width: 1440, height: 900 }, 1],
  ["dark", "phone", { width: 390, height: 844 }, 2],
]) {
  for (const [name, path] of Object.entries(pages)) {
    const ctx = await browser.newContext({
      viewport,
      deviceScaleFactor: scale,
      storageState: state,
      reducedMotion: "reduce",
      colorScheme: theme,
    });
    await ctx.addInitScript((t) => {
      const k = "user-preferences";
      const cur = JSON.parse(
        localStorage.getItem(k) ?? '{"state":{},"version":0}',
      );
      cur.state = { ...cur.state, theme: t };
      localStorage.setItem(k, JSON.stringify(cur));
    }, theme);
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.evaluate(
      () =>
        document.activeElement instanceof HTMLElement &&
        document.activeElement.blur(),
    );
    const text = await page.evaluate(() => document.body.innerText);
    const fails = [
      ...errs,
      ...BAD.filter((b) => text.includes(b)).map((b) => `error text: ${b}`),
    ];
    if (text.trim().length < 40) fails.push("page rendered no content");
    const m = await page.evaluate(() => {
      const h = document.querySelector('[data-slot="layout-header"], header');
      return {
        header_h: h ? Math.round(h.getBoundingClientRect().height) : null,
        dark: document.documentElement.classList.contains("dark"),
      };
    });
    if (m.dark !== (theme === "dark"))
      fails.push(`theme not applied (dark=${m.dark})`);
    const shot = `${name}--${tag}-${theme}.png`;
    await page.screenshot({ path: join(OUT, shot) });
    checks[shot] = { fails, ...m, url: page.url() };
    console.log(
      `${fails.length ? "FAIL" : "ok  "} ${shot} ${JSON.stringify(m)}${fails.length ? `\n      ${fails.join("\n      ")}` : ""}`,
    );
    await ctx.close();
  }
}

// Interaction states on the table page (dark desktop): account menu open, collapsed rail.
for (const [shot, prefs, act] of [
  [
    "account-menu--desktop-dark.png",
    {},
    async (page) => {
      await page.getByRole("button", { name: "Open profile menu" }).click();
      await page.waitForTimeout(400);
    },
  ],
  ["rail--desktop-dark.png", { sidebarDefaultOpen: false }, async () => {}],
]) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: state,
    reducedMotion: "reduce",
    colorScheme: "dark",
  });
  await ctx.addInitScript((p) => {
    const k = "user-preferences";
    const cur = JSON.parse(
      localStorage.getItem(k) ?? '{"state":{},"version":0}',
    );
    cur.state = { ...cur.state, theme: "dark", ...p };
    localStorage.setItem(k, JSON.stringify(cur));
  }, prefs);
  const page = await ctx.newPage();
  const fails = [];
  page.on("pageerror", (e) => fails.push(String(e)));
  await page.goto(BASE + (pages.table ?? Object.values(pages)[0]), {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(1200);
  try {
    await act(page);
  } catch (e) {
    fails.push(`interaction failed: ${String(e).split("\n")[0]}`);
  }
  const m = await page.evaluate(() => {
    const b = document.querySelector('[aria-label="Open profile menu"]');
    const r = b?.getBoundingClientRect();
    // rail axis (design v3 §4): centre x of every visible control in the collapsed sidebar
    const rail = document.querySelector(
      '[data-state="collapsed"] [data-sidebar="sidebar"]',
    );
    const xs = rail
      ? [...rail.querySelectorAll("button, a")]
          .map((el) => el.getBoundingClientRect())
          .filter((q) => q.width > 0 && q.height > 0)
          .map((q) => Math.round(q.left + q.width / 2))
      : [];
    return {
      account_trigger: r
        ? `${Math.round(r.width)}x${Math.round(r.height)}`
        : null,
      rail_axis: xs.length ? [...new Set(xs)].sort((a, b) => a - b) : undefined,
    };
  });
  if (!m.account_trigger) fails.push("account trigger missing");
  if (m.rail_axis && m.rail_axis.at(-1) - m.rail_axis[0] > 2)
    fails.push(`rail controls off one axis: centres ${m.rail_axis.join(",")}`);
  await page.screenshot({ path: join(OUT, shot) });
  checks[shot] = { fails, ...m };
  console.log(
    `${fails.length ? "FAIL" : "ok  "} ${shot} ${JSON.stringify(m)}${fails.length ? `\n      ${fails.join("\n      ")}` : ""}`,
  );
  await ctx.close();
}
await browser.close();
writeFileSync(join(OUT, "checks.json"), JSON.stringify(checks, null, 1));
const bad = Object.values(checks).reduce((n, c) => n + c.fails.length, 0);
console.log(`${Object.keys(checks).length} shots · ${bad} failures`);
process.exit(bad ? 1 : 0);
