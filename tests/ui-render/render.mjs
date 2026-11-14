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
    if (m.header_h !== null && m.header_h !== 44)
      fails.push(`header ${m.header_h}px, want 44`);
    const shot = `${name}--${tag}-${theme}.png`;
    await page.screenshot({ path: join(OUT, shot) });
    checks[shot] = { fails, ...m, url: page.url() };
    console.log(
      `${fails.length ? "FAIL" : "ok  "} ${shot} ${JSON.stringify(m)}${fails.length ? `\n      ${fails.join("\n      ")}` : ""}`,
    );
    await ctx.close();
  }
}

// Phone sheet with a collapsed desktop preference: chrome must be expanded
// (`state` tracks the desktop preference; isMobile overrides it — review fix b).
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: state,
    reducedMotion: "reduce",
    colorScheme: "dark",
    hasTouch: true,
  });
  await ctx.addInitScript(() => {
    const k = "user-preferences";
    const cur = JSON.parse(
      localStorage.getItem(k) ?? '{"state":{},"version":0}',
    );
    cur.state = { ...cur.state, theme: "dark", sidebarDefaultOpen: false };
    localStorage.setItem(k, JSON.stringify(cur));
  });
  const page = await ctx.newPage();
  const fails = [];
  page.on("pageerror", (e) => fails.push(String(e)));
  await page.goto(BASE + (pages.table ?? Object.values(pages)[0]), {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(1200);
  try {
    await page
      .getByTestId("mobile-sidebar-toggle")
      .first()
      .click({ force: true });
    await page.waitForTimeout(600);
  } catch (e) {
    fails.push(`open sheet failed: ${String(e).split("\n")[0]}`);
  }
  const m = await page.evaluate(() => {
    const q = (sel) => document.querySelector(sel);
    const btn = (name) =>
      [...document.querySelectorAll("button")].find(
        (b) => b.getAttribute("aria-label") === name,
      );
    const members = btn("Members");
    const account = btn("Open profile menu");
    const rect = (el) => el?.getBoundingClientRect();
    const r = rect(members);
    const a = rect(account);
    return {
      members_label_visible: !!members?.innerText.includes("Members"),
      members_h: r ? Math.round(r.height) : null,
      account_label_visible: !!account?.innerText.trim(),
      account_h: a ? Math.round(a.height) : null,
      org_aria: q(
        '[data-testid="sidebar-organization-identity"]',
      )?.getAttribute("aria-label"),
    };
  });
  if (!m.members_label_visible)
    fails.push(
      "mobile sheet shows collapsed chrome (Members is a bare square)",
    );
  if (!m.account_label_visible)
    fails.push("account row has no visible name in the mobile sheet");
  if (m.members_h !== null && m.members_h < 40)
    fails.push(`Members touch target ${m.members_h}px, want >=44 coarse`);
  const shot = "sheet-phone--phone-dark.png";
  await page.screenshot({ path: join(OUT, shot) });
  checks[shot] = { fails, ...m };
  console.log(
    `${fails.length ? "FAIL" : "ok  "} ${shot} ${JSON.stringify(m)}${fails.length ? `\n      ${fails.join("\n      ")}` : ""}`,
  );
  await ctx.close();
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
    const offAxis = rail
      ? [...rail.querySelectorAll("button, a")]
          .filter((el) => el.getBoundingClientRect().width > 0)
          .map((el) => {
            const q = el.getBoundingClientRect();
            return `${Math.round(q.left + q.width / 2)}:${Math.round(q.width)}x${Math.round(q.height)}:${el.getAttribute("aria-label") ?? el.getAttribute("data-testid") ?? el.textContent?.trim().slice(0, 12)}`;
          })
      : [];
    return {
      account_trigger: r
        ? `${Math.round(r.width)}x${Math.round(r.height)}`
        : null,
      rail_axis: xs.length ? [...new Set(xs)].sort((a, b) => a - b) : undefined,
      rail_controls: offAxis.length ? offAxis : undefined,
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

// Table interaction states (dark desktop), design v3 S2.
const TABLE_STATES = [
  [
    "table-fields",
    async (p) => p.getByRole("button", { name: /^Fields/ }).click(),
  ],
  [
    "table-filter",
    async (p) => {
      await p.getByRole("button", { name: /^Filter/ }).click();
      await p.getByRole("button", { name: "Add filter" }).click();
    },
  ],
  ["table-sort", async (p) => p.getByRole("button", { name: /^Sort/ }).click()],
  [
    "table-more",
    async (p) => p.getByRole("button", { name: "Table options" }).click(),
  ],
  [
    "table-field",
    async (p) => p.getByRole("button", { name: "Cost field menu" }).click(),
  ],
  [
    "table-noresult",
    async (p) => p.getByLabel("Search rows").fill("zzz-no-match"),
  ],
  [
    "table-select",
    async (p) => {
      await p.getByRole("checkbox", { name: "Select row 1" }).click();
      await p.waitForTimeout(300);
    },
  ],
  [
    "table-group",
    async (p) => {
      await p.getByRole("button", { name: /^Group/ }).click();
      await p.waitForTimeout(300);
      await p.getByRole("combobox").first().click();
      await p.waitForTimeout(300);
      await p.getByRole("option", { name: "Stage" }).click();
      await p.waitForTimeout(300);
      await p.keyboard.press("Escape");
      await p.waitForTimeout(400);
    },
  ],
];
if (pages.table) {
  for (const [name, act] of TABLE_STATES) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      storageState: state,
      reducedMotion: "reduce",
      colorScheme: "dark",
    });
    await ctx.addInitScript(() => {
      const k = "user-preferences";
      const cur = JSON.parse(
        localStorage.getItem(k) ?? '{"state":{},"version":0}',
      );
      cur.state = { ...cur.state, theme: "dark" };
      localStorage.setItem(k, JSON.stringify(cur));
    });
    const page = await ctx.newPage();
    const fails = [];
    page.on("pageerror", (e) => fails.push(String(e)));
    await page.goto(BASE + pages.table, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    try {
      await act(page);
      await page.waitForTimeout(500);
    } catch (e) {
      fails.push(`interaction failed: ${String(e).split("\n")[0]}`);
    }
    // scaffold geometry: 44px header, 40px toolbar, 32px rows (DS §1.4)
    const m = await page.evaluate(() => {
      const h = (sel) => {
        const el = document.querySelector(sel);
        return el ? Math.round(el.getBoundingClientRect().height) : null;
      };
      return {
        header_h: h("header"),
        toolbar_h: h('[data-slot="layout-toolbar"]'),
        row_h: h('[role="grid"] [role="row"][aria-rowindex]'),
        heads: [...document.querySelectorAll('[role="columnheader"]')].map(
          (e) =>
            `${e.innerText.trim()}|${e.querySelector("button")?.getAttribute("aria-label") ?? ""}`,
        ),
        toolbar_font: (() => {
          const b = document.querySelector(
            '[data-slot="layout-toolbar"] button',
          );
          return b ? getComputedStyle(b).fontSize : null;
        })(),
        bulk: !!document.body.innerText.match(/\d+ selected/),
        selected_cell_bg: (() => {
          const selected = document.querySelector(
            '[role="row"][aria-selected="true"] [role="gridcell"]',
          );
          const plain = document.querySelector(
            '[role="row"]:not([aria-selected]) [role="gridcell"]',
          );
          if (!selected || !plain) return null;
          return {
            selected: getComputedStyle(selected).backgroundColor,
            plain: getComputedStyle(plain).backgroundColor,
          };
        })(),
        groups: [
          ...document.querySelectorAll('button[aria-label*="group" i]'),
        ].filter((b) => b.getAttribute("aria-expanded") !== null).length,
      };
    });
    if (!m.heads.some((x) => x.startsWith("Batch")))
      fails.push("field names missing from header");
    if (m.header_h !== 44) fails.push(`header ${m.header_h}px, want 44`);
    if (m.toolbar_font !== "13px")
      fails.push(`toolbar font ${m.toolbar_font}, want 13px`);
    if (m.toolbar_h !== 40) fails.push(`toolbar ${m.toolbar_h}px, want 40`);
    if (name !== "table-noresult" && m.row_h !== 32)
      fails.push(`row ${m.row_h}px, want 32`);
    if (name === "table-select" && !m.bulk)
      fails.push("bulk bar missing after row select");
    if (
      name === "table-select" &&
      m.selected_cell_bg &&
      m.selected_cell_bg.selected === m.selected_cell_bg.plain
    )
      fails.push("selected row cells are not tinted");
    if (name === "table-group" && m.groups < 1)
      fails.push("no group headers after grouping");
    const shot = `${name}--desktop-dark.png`;
    await page.screenshot({ path: join(OUT, shot) });
    checks[shot] = { fails, ...m };
    console.log(
      `${fails.length ? "FAIL" : "ok  "} ${shot} ${JSON.stringify(m)}${fails.length ? `\n      ${fails.join("\n      ")}` : ""}`,
    );
    await ctx.close();
  }

  // S7: the toolbar popovers must be usable at 390px — the popup stays inside
  // the viewport with no horizontal overflow (no bottom-sheet rebuild unless
  // this proves otherwise).
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: state,
    reducedMotion: "reduce",
    colorScheme: "dark",
    hasTouch: true,
  });
  await ctx.addInitScript(() => {
    const k = "user-preferences";
    const cur = JSON.parse(
      localStorage.getItem(k) ?? '{"state":{},"version":0}',
    );
    cur.state = { ...cur.state, theme: "dark" };
    localStorage.setItem(k, JSON.stringify(cur));
  });
  const page = await ctx.newPage();
  const fails = [];
  page.on("pageerror", (e) => fails.push(String(e)));
  await page.goto(BASE + pages.table, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  try {
    await page.getByRole("button", { name: /^Filter/ }).click();
    await page.getByRole("button", { name: "Add filter" }).click();
    await page.waitForTimeout(500);
  } catch (e) {
    fails.push(`interaction failed: ${String(e).split("\n")[0]}`);
  }
  const m = await page.evaluate(() => {
    const popup = document.querySelector('[data-slot="popover-popup"]');
    const r = popup ? popup.getBoundingClientRect() : null;
    return {
      popup: r
        ? {
            left: Math.round(r.left),
            right: Math.round(r.right),
            top: Math.round(r.top),
            width: Math.round(r.width),
          }
        : null,
      overflow_x: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    };
  });
  if (!m.popup) fails.push("filter popup not found");
  if (m.popup) {
    if (m.popup.right > m.viewport)
      fails.push(`popup right ${m.popup.right} > viewport ${m.viewport}`);
    if (m.popup.left < 0) fails.push(`popup left ${m.popup.left} < 0`);
  }
  if (m.overflow_x > m.viewport)
    fails.push(`page overflow-x ${m.overflow_x} > ${m.viewport}`);
  const shot = "table-filter-phone--phone-dark.png";
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
