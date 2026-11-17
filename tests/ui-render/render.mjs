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
    data: { tablesEnabled: true, dashboardsEnabled: true },
  });
  const board = await post("/board", {
    name: "Pilot line",
    organizationId: org.id,
    icon: "Rocket",
    slug: "KFL",
  });
  const tasks = [];
  for (const [title, status, priority] of [
    ["Filter housing leak on line 2", "in-progress", "high"],
    ["QC retry policy for failed batches", "to-do", "medium"],
    ["Gasket torque checklist", "in-review", "low"],
    ["Supplier audit notes", "done", "no-priority"],
    // A ticket parked in the seeded Canceled lane: exercises the closed lane.
    ["Warranty claim intake", "canceled", "medium"],
    // Off-board statuses are real rows now: these land on the Backlog page.
    ["Spare-parts reorder threshold", "planned", "low"],
    ["Customer report: odd pump noise", "triage", "high"],
    ["Same as filter housing leak", "duplicate", "no-priority"],
  ])
    tasks.push(
      await post(`/task/${board.id}`, {
        title,
        description: "seeded",
        status,
        priority,
      }),
    );
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
        ].map(([label, color]) => ({
          id: `choice-${label.toLowerCase().replaceAll(" ", "-")}`,
          label,
          color,
        })),
      },
    ],
    ["Cost", "currency", { code: "IDR" }],
    ["Start date", "date"],
    ["Note", "longtext"],
    // Tickets as a real column: chips resolve key/title/status server-side.
    ["Tickets", "ticket"],
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
        [f.Stage.id]: f.Stage.options.choices.find(
          (choice) => choice.label === stage,
        ).id,
        [f.Cost.id]: cost,
        [f["Start date"].id]: `2026-11-${String(10 - i).padStart(2, "0")}`,
        [f.Note.id]:
          i === 0
            ? "## Retest\n\n**Gasket swap** completed.\n\n- Check pressure\n- Record the result"
            : "",
        [f.Tickets.id]:
          i === 0
            ? tasks.slice(0, 3).map((task) => task.id)
            : tasks[i]
              ? [tasks[i].id]
              : [],
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
  // Ticket page: "Included in" lists the row whose ticket cell holds KFL-1.
  ticket: `/dashboard/${slug}/tickets/KFL-1`,
  settings: "/dashboard/settings/account/authentication",
  // Status model: Status settings grouped by type, and the Backlog page whose
  // sections are the board's off-board statuses.
  workflow: `/dashboard/settings/boards/${board.id}/workflow`,
  backlog: `/dashboard/organization/${slug}/board/${board.slug ?? "KFL"}/backlog`,
  // Feature flags: every rollout stage uses one badge; Dashboards has its own switch.
  features: "/dashboard/settings/organization/features",
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
      hasTouch: tag === "phone",
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
    // Resource toolbar acceptance: real phone geometry, not just screenshots.
    if (name === "table" || name === "board") {
      const toolbar = await page.evaluate((surface) => {
        const root = document.querySelector(
          surface === "table"
            ? '[data-slot="layout-toolbar"]'
            : '[data-testid="board-toolbar"]',
        );
        if (!root) return null;
        const controls = [...root.querySelectorAll("button, input")].map(
          (el) => {
            const r = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return {
              name: el.getAttribute("aria-label"),
              left: r.left,
              right: r.right,
              top: r.top,
              height: r.height,
              chrome: [
                style.height,
                style.borderTopWidth,
                style.borderTopStyle,
                style.fontSize,
                style.fontWeight,
                style.paddingTop,
                style.paddingRight,
                style.paddingBottom,
                style.paddingLeft,
              ],
            };
          },
        );
        const buttons = [...root.querySelectorAll("[data-toolbar-button]")];
        const labels = [...root.querySelectorAll("[data-toolbar-label]")].map(
          (el) => getComputedStyle(el).display,
        );
        const primary = root.querySelector("[data-toolbar-primary]");
        const r = primary?.getBoundingClientRect();
        return {
          controls,
          labels,
          buttonCount: buttons.length,
          primary: r
            ? { left: r.left, right: r.right, top: r.top, height: r.height }
            : null,
          chrome: buttons.map((el) => {
            const s = getComputedStyle(el);
            return [
              s.height,
              s.borderTopWidth,
              s.borderTopStyle,
              s.fontSize,
              s.fontWeight,
              s.paddingTop,
              s.paddingRight,
              s.paddingBottom,
              s.paddingLeft,
            ];
          }),
          viewport: innerWidth,
        };
      }, name);
      if (!toolbar) fails.push("resource toolbar missing");
      else {
        if (toolbar.buttonCount < 5 || !toolbar.labels.length)
          fails.push("toolbar controls missing");
        for (const control of toolbar.controls) {
          if (control.left < 0 || control.right > toolbar.viewport)
            fails.push(`toolbar control clipped: ${JSON.stringify(control)}`);
        }
        if (
          !toolbar.primary ||
          toolbar.primary.right > toolbar.viewport ||
          toolbar.primary.left < 0 ||
          toolbar.primary.height !== 28
        )
          fails.push(
            `primary action clipped or missing: ${JSON.stringify(toolbar.primary)}`,
          );
        if (toolbar.primary && toolbar.controls[0]?.top !== toolbar.primary.top)
          fails.push("primary action orphaned on its own row");
        if (
          toolbar.labels.some(
            (display) => (tag === "phone") !== (display === "none"),
          )
        )
          fails.push(`toolbar labels did not collapse: ${toolbar.labels}`);
        for (const chrome of toolbar.chrome) {
          if (JSON.stringify(chrome) !== JSON.stringify(toolbar.chrome[0]))
            fails.push(
              `toolbar buttons have different chrome: ${JSON.stringify(toolbar.chrome)}`,
            );
          if (
            chrome[0] !== "28px" ||
            chrome[1] !== "1px" ||
            chrome[3] !== "12px" ||
            chrome[6] !== "8px" ||
            chrome[8] !== "8px"
          )
            fails.push(`toolbar chrome off scale: ${JSON.stringify(chrome)}`);
        }
        const sibling =
          checks[`${name === "board" ? "table" : "board"}--${tag}-${theme}.png`]
            ?.toolbar;
        if (
          sibling &&
          JSON.stringify(sibling.chrome[0]) !==
            JSON.stringify(toolbar.chrome[0])
        )
          fails.push("board/table toolbar chrome differs");
      }
      // These states are also the baseline desktop/phone screenshots below.
      checks[`${name}--${tag}-${theme}.png`] = { toolbar };
    }
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
    // One stage-badge style everywhere: sidebar sections and settings rows.
    if (tag === "desktop" && (name === "table" || name === "features")) {
      const badges = await page.evaluate(() =>
        [...document.querySelectorAll('[data-slot="badge"]')]
          .filter((b) => /^(Alpha|Beta)$/.test(b.textContent.trim()))
          .map((b) => ({ text: b.textContent.trim(), cls: b.className })),
      );
      const want = name === "table" ? ["Tables", "Dashboards"] : ["Dashboards"];
      if (badges.length < (name === "table" ? 2 : 4))
        fails.push(`stage badges missing (${badges.length})`);
      if (new Set(badges.map((b) => b.cls)).size > 1)
        fails.push("stage badges use different styles");
      for (const label of want)
        if (!text.includes(label)) fails.push(`${label} missing`);
      if (
        name === "features" &&
        !(await page.getByRole("switch", { name: "Enable Dashboards" }).count())
      )
        fails.push("Dashboards feature switch missing");
    }
    // The ticket column renders linked tickets as KEY chips, not raw ids.
    if (name === "table" && tag === "desktop" && !/\bKFL-\d+\b/.test(text))
      fails.push("ticket column rendered no KFL-n chip");
    if (
      name === "ticket" &&
      !(text.includes("Included in") && text.includes("PB-1042"))
    )
      fails.push("ticket page shows no Included in row (PB-1042)");
    const shot = `${name}--${tag}-${theme}.png`;
    await page.screenshot({ path: join(OUT, shot) });
    checks[shot] = { ...checks[shot], fails, ...m, url: page.url() };
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
    // History is a view tab beside Grid, like the board's List/Board tabs.
    "table-history",
    async (p) => {
      await p.getByRole("tab", { name: "History", exact: true }).click();
      await p
        .getByText(/created row/)
        .first()
        .waitFor();
      if (!p.url().includes("view=history"))
        throw new Error("History view is not in the URL");
    },
  ],
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
    // Search matches what cells show: a select label, not only text fields.
    "table-search",
    async (p) => {
      await p.getByLabel("Search rows").fill("curing");
      await p.waitForTimeout(300);
      const rows = await p.locator('[role="row"][aria-rowindex]').count();
      if (rows !== 1)
        throw new Error(
          `search for a select label matched ${rows} rows, want 1`,
        );
    },
  ],
  [
    "table-select",
    async (p) => {
      await p.getByRole("checkbox", { name: "Select row 1" }).click();
      await p.waitForTimeout(300);
    },
  ],
  [
    // Active cell: one click selects (accent ring), arrows move it.
    "table-active-cell",
    async (p) => {
      await p.getByRole("gridcell", { name: "Cost, row 1" }).click();
      await p.keyboard.press("ArrowDown");
      await p.waitForTimeout(200);
    },
  ],
  [
    "table-add-row",
    async (p) => {
      const before = await p.getByRole("grid").getAttribute("aria-rowcount");
      const response = p.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().endsWith("/rows"),
      );
      await p
        .getByRole("button", { name: "New row", exact: true })
        .first()
        .click();
      const added = await response;
      if (!added.ok())
        throw new Error(`add row ${added.status()} ${await added.text()}`);
      const row = await added.json();
      await p.waitForFunction(
        (count) =>
          document
            .querySelector('[role="grid"]')
            ?.getAttribute("aria-rowcount") !== count,
        before,
      );
      // Keep subsequent seeded states independent of this mutation.
      const removed = await p.request.delete(
        `${BASE}/api/data-table/organization/${org.id}/${tbl.id}/rows/${row.id}`,
      );
      if (!removed.ok())
        throw new Error("could not clean up render's own new row");
    },
  ],
  [
    "table-primary-edit",
    async (p) => {
      const note = await p
        .getByRole("gridcell", { name: "Note, row 1", exact: true })
        .evaluate((cell) => {
          const heading = cell.querySelector("h2");
          const preview = cell.querySelector('[data-expanded="false"]');
          if (!heading || !preview) return null;
          const h = heading.getBoundingClientRect();
          const b = preview.getBoundingClientRect();
          return {
            top: h.top,
            bottom: h.bottom,
            clipTop: b.top,
            clipBottom: b.bottom,
            text: heading.textContent,
          };
        });
      if (
        !note ||
        note.text !== "Retest" ||
        note.top < note.clipTop - 1 ||
        note.bottom > note.clipBottom + 1
      )
        throw new Error(`Markdown preview clipped ${JSON.stringify(note)}`);
      const cell = p.getByRole("gridcell", {
        name: "Batch, row 1",
        exact: true,
      });
      await cell.click();
      if (await p.getByRole("dialog").count())
        throw new Error("primary click opened the drawer");
      await p.keyboard.press("Enter");
      await p
        .getByRole("textbox", { name: "Batch", exact: true })
        .fill("Discard this edit");
      await p.keyboard.press("Escape");
      await p.waitForTimeout(200);
      if (!(await cell.innerText()).includes("PB-1042 Filter test A"))
        throw new Error("Escape committed an edit");
    },
  ],
  [
    "table-scroll-resize",
    async (p) => {
      const head = p.getByRole("columnheader").filter({
        has: p.getByRole("button", { name: "Batch field menu", exact: true }),
      });
      const width = (await head.boundingBox()).width;
      const handle = p.getByRole("separator", {
        name: "Resize Batch column",
        exact: true,
      });
      await handle.focus();
      await p.keyboard.press("ArrowRight");
      if ((await head.boundingBox()).width <= width)
        throw new Error("resize did not widen the column");
      await p.reload({ waitUntil: "networkidle" });
      if ((await head.boundingBox()).width <= width)
        throw new Error("column width did not persist");
      await p
        .getByRole("gridcell", { name: "Cost, row 1", exact: true })
        .click();
      await p.getByRole("grid").evaluate((grid) => {
        let el = grid.parentElement;
        while (el && getComputedStyle(el).overflowX !== "auto")
          el = el.parentElement;
        if (!el) throw new Error("no grid scroller");
        el.scrollLeft = 500;
      });
      await p.waitForTimeout(300);
      const geometry = await p.evaluate(() => {
        const row = document.querySelector('[role="row"][aria-rowindex]');
        const header = document.querySelector('[role="grid"] [role="row"]');
        const a = row?.querySelector('[role="rowheader"]');
        const b = header?.querySelector('[role="columnheader"]');
        const cell = row?.querySelector('[role="gridcell"]');
        const hcell = header?.querySelectorAll('[role="columnheader"]')[1];
        if (!a || !b || !cell || !hcell)
          throw new Error("missing frozen cells");
        return {
          gutter: a.getBoundingClientRect().left,
          headerGutter: b.getBoundingClientRect().left,
          primary: cell.getBoundingClientRect().left,
          headerPrimary: hcell.getBoundingClientRect().left,
          sticky: getComputedStyle(a).position,
        };
      });
      if (
        geometry.sticky !== "sticky" ||
        Math.abs(geometry.gutter - geometry.headerGutter) > 1 ||
        Math.abs(geometry.primary - geometry.headerPrimary) > 1
      )
        throw new Error(`frozen geometry ${JSON.stringify(geometry)}`);
    },
  ],
  [
    "table-bulk-label",
    async (p) => {
      await p
        .getByRole("checkbox", { name: "Select row 1", exact: true })
        .click();
      const selects = p.getByRole("combobox");
      await selects.first().click();
      await p.getByRole("option", { name: "Stage", exact: true }).click();
      await selects.nth(1).click();
      await p.getByRole("option", { name: "Curing", exact: true }).click();
      if (!(await selects.nth(1).innerText()).includes("Curing"))
        throw new Error("bulk picker displays an id instead of its label");
    },
  ],
  [
    // Ticket picker: current link listed first + selected, newest options below.
    "table-ticket-picker",
    async (p) => {
      // First click selects the cell, the second opens its picker; only the
      // chip's key navigates.
      await p.getByText("Supplier audit notes").first().click();
      await p.waitForTimeout(200);
      await p.getByText("Supplier audit notes").first().click();
      await p.waitForTimeout(600);
    },
  ],
  [
    // Change type asks first, and says the column will be cleared.
    "table-change-type",
    async (p) => {
      await p.getByRole("button", { name: "Tickets field menu" }).click();
      await p.getByRole("menuitem", { name: "Change field type" }).click();
      await p.getByRole("menuitem", { name: "Text", exact: true }).click();
      await p.waitForTimeout(300);
    },
  ],
  [
    "table-type-roundtrip",
    async (p) => {
      await p.getByRole("button", { name: "Stage field menu" }).click();
      await p
        .getByRole("menuitem", { name: "Edit field", exact: true })
        .click();
      await p.getByRole("button", { name: "Text", exact: true }).click();
      await p.getByRole("button", { name: "Edit field", exact: true }).click();
      const confirm = p.getByRole("button", {
        name: "Double-click to change type",
        exact: true,
      });
      await confirm.click();
      if (!(await confirm.isVisible()))
        throw new Error("single click changed the type");
      const changed = p.waitForResponse(
        (r) => r.request().method() === "PUT" && r.url().includes("/fields/"),
      );
      await confirm.dblclick();
      if (!(await changed).ok()) throw new Error("type change failed");
      await p.getByRole("alertdialog").waitFor({ state: "hidden" });
      await p.keyboard.press("Escape");
      await p.getByRole("tab", { name: "History", exact: true }).click();
      const restore = p.getByRole("button", {
        name: "Restore original field",
        exact: true,
      });
      await restore.first().click();
      const reverted = p.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().endsWith("/revert"),
      );
      await p
        .getByRole("alertdialog")
        .getByRole("button", { name: "Restore original field", exact: true })
        .click();
      if (!(await reverted).ok()) throw new Error("type restoration failed");
      await p.getByRole("alertdialog").waitFor({ state: "hidden" });
      await p.getByRole("tab", { name: "Grid", exact: true }).click();
      await p
        .getByRole("gridcell", { name: "Stage, row 1", exact: true })
        .getByText("Mixing", { exact: true })
        .waitFor();
    },
  ],
  [
    "table-comment",
    async (p) => {
      await p
        .getByRole("button", { name: "Expand row 1", exact: true })
        .click();
      const editor = p.locator(
        '[data-slot="table-activity"] [contenteditable="true"]',
      );
      await editor.fill("Render comment: pressure verified");
      const saved = p.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().endsWith("/comments"),
      );
      await p
        .getByRole("button", { name: "Submit comment", exact: true })
        .click();
      if (!(await saved).ok()) throw new Error("comment write failed");
      await p
        .locator('[data-slot="table-activity"] ol')
        .getByText("Render comment: pressure verified", { exact: true })
        .waitFor();
      if ((await editor.innerText()).trim())
        throw new Error("comment draft was not cleared");
      await p.reload({ waitUntil: "networkidle" });
      await p
        .getByRole("button", { name: "Expand row 1", exact: true })
        .click();
      await p
        .locator('[data-slot="table-activity"] ol')
        .getByText("Render comment: pressure verified", { exact: true })
        .waitFor();
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
    if (m.header_h !== 44) fails.push(`header ${m.header_h}px, want 44`);
    // History replaces the grid, so the grid geometry does not apply to it.
    if (name !== "table-history") {
      if (!m.heads.some((x) => x.startsWith("Batch")))
        fails.push("field names missing from header");
      // Board toolbar buttons are 12px; the table matches them.
      if (m.toolbar_font !== "12px")
        fails.push(`toolbar font ${m.toolbar_font}, want 12px`);
      if (m.toolbar_h !== 40) fails.push(`toolbar ${m.toolbar_h}px, want 40`);
      if (name !== "table-noresult" && m.row_h !== 32)
        fails.push(`row ${m.row_h}px, want 32`);
    }
    if (name === "table-select" && !m.bulk)
      fails.push("bulk bar missing after row select");
    if (name === "table-active-cell") {
      const cell = await page.evaluate(() => {
        const el = document.querySelector(
          '[role="gridcell"][aria-selected="true"]',
        );
        return el
          ? {
              label: el.getAttribute("aria-label"),
              ring: getComputedStyle(el).boxShadow,
              // One highlight: focus sits on the grid, not a cell's button.
              gridFocused:
                document.activeElement?.getAttribute("role") === "grid",
            }
          : null;
      });
      if (
        cell?.label !== "Cost, row 2" ||
        !cell.ring.includes("inset") ||
        !cell.gridFocused
      )
        fails.push(`active cell ${JSON.stringify(cell)}`);
    }
    if (name === "table-ticket-picker") {
      const picker = await page.evaluate(() => ({
        selected: document.querySelectorAll(
          '[role="listbox"] [role="option"][aria-selected="true"]',
        ).length,
        options: document.querySelectorAll('[role="listbox"] [role="option"]')
          .length,
      }));
      if (picker.selected !== 1 || picker.options < 2)
        fails.push(`ticket picker ${JSON.stringify(picker)}`);
    }
    if (name === "table-change-type") {
      const text = await page
        .getByRole("alertdialog")
        .innerText({ timeout: 3000 })
        .catch(() => "");
      if (!text.includes("cleared")) fails.push("change-type warning missing");
    }
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

// Ticket status model: every status is a typed board row. One context checks
// the board (lanes = shown statuses only), the open picker (the board's full
// status list, grouped), the Backlog page (sections = off-board statuses) and
// Status settings (one group per type) — the model end to end.
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: state,
    reducedMotion: "reduce",
    colorScheme: "dark",
  });
  const page = await ctx.newPage();
  const fails = [];
  page.on("pageerror", (e) => fails.push(String(e)));
  const boardPath = `/dashboard/organization/${slug}/board/${board.slug ?? "KFL"}/board`;
  const m = {};
  try {
    await page.goto(BASE + boardPath, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    m.board_text_has_duplicate_ticket = await page
      .getByText("Same as filter housing leak")
      .count();
    await page.getByText("QC retry policy for failed batches").first().click();
    await page.getByTestId("task-status-trigger").click();
    await page.getByTestId("status-section-closed").waitFor({ timeout: 5000 });
    m.picker = await page.evaluate(() => {
      const popup = document.querySelector('[data-slot="popover-popup"]');
      const text = popup?.textContent ?? "";
      return {
        sections: ["backlog", "active", "closed"].filter((id) =>
          popup?.querySelector(`[data-testid="status-section-${id}"]`),
        ),
        has: [
          "Triage",
          "Planned",
          "To Do",
          "In Review",
          "Done",
          "Canceled",
          "Duplicate",
        ].filter((label) => text.includes(label)),
        archive: Boolean(
          popup?.querySelector('[data-testid="task-archive-action"]'),
        ),
      };
    });
    await page.waitForTimeout(600); // let the popup's open transition settle
    await page.screenshot({
      path: join(OUT, "status-popover--desktop-dark.png"),
    });
  } catch (e) {
    fails.push(`board/picker interaction failed: ${String(e).split("\n")[0]}`);
  }
  if (m.board_text_has_duplicate_ticket)
    fails.push(
      "Duplicate ticket rendered on the board (Duplicate is off-board by default)",
    );
  if (m.picker?.sections?.length !== 3)
    fails.push(
      `picker sections ${JSON.stringify(m.picker?.sections)}, want backlog/active/closed`,
    );
  if (m.picker?.has?.length !== 7)
    fails.push(
      `picker statuses ${JSON.stringify(m.picker?.has)}, want all 7 seeded labels`,
    );
  if (!m.picker?.archive)
    fails.push("Archive action missing from its own section");

  try {
    await page.goto(BASE + boardPath.replace(/\/board$/, "/backlog"), {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(1200);
    m.backlog = await page.evaluate(() => ({
      sections: [
        ...document.querySelectorAll('[data-testid^="backlog-section-"]'),
      ].map((el) =>
        el.getAttribute("data-testid")?.replace("backlog-section-", ""),
      ),
      text: document.body.innerText.includes("Spare-parts reorder threshold"),
    }));
    await page.screenshot({
      path: join(OUT, "status-backlog--desktop-dark.png"),
    });

    // Settings scroll inside an inner panel: a tall viewport shows all 7 groups.
    await page.setViewportSize({ width: 1440, height: 2000 });
    await page.goto(`${BASE}/dashboard/settings/boards/${board.id}/workflow`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(1200);
    m.settings_groups = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="status-group-"]')].map(
        (el) => el.getAttribute("data-testid")?.replace("status-group-", ""),
      ),
    );
    await page.screenshot({
      path: join(OUT, "status-settings--desktop-dark.png"),
    });
  } catch (e) {
    fails.push(
      `backlog/settings interaction failed: ${String(e).split("\n")[0]}`,
    );
  }
  const wantBacklog = ["triage", "planned", "duplicate", "archived"];
  if (JSON.stringify(m.backlog?.sections) !== JSON.stringify(wantBacklog))
    fails.push(
      `backlog sections ${JSON.stringify(m.backlog?.sections)}, want ${JSON.stringify(wantBacklog)}`,
    );
  if (!m.backlog?.text)
    fails.push("Planned ticket missing from the Backlog page");
  const wantGroups = [
    "triage",
    "backlog",
    "unstarted",
    "started",
    "completed",
    "canceled",
    "duplicate",
  ];
  if (JSON.stringify(m.settings_groups) !== JSON.stringify(wantGroups))
    fails.push(
      `settings groups ${JSON.stringify(m.settings_groups)}, want ${JSON.stringify(wantGroups)}`,
    );

  const shot = "status-model--desktop-dark.png";
  checks[shot] = { fails, ...m };
  console.log(
    `${fails.length ? "FAIL" : "ok  "} ${shot} ${JSON.stringify(m)}${fails.length ? `\n      ${fails.join("\n      ")}` : ""}`,
  );
  await ctx.close();
}

// Overlay inset (KFL-395). The modal primitives own the 16px content gutter:
// header text, body content and footer actions share one inset. Measured from
// painted pixels (text ranges, borders, fills) rather than from slots, so the
// assert reads any markup — including the pre-fix markup it was written against.
const overlayGeometry = () => {
  const popup = [...document.querySelectorAll('[data-slot$="-popup"]')]
    .filter((el) => /^(dialog|alert-dialog|sheet)-popup$/.test(el.dataset.slot))
    .at(-1);
  if (!popup) return null;
  const box = popup.getBoundingClientRect();
  const left = box.left + popup.clientLeft;
  const right = left + popup.clientWidth;
  const clear = (c) => c === "transparent" || /,\s*0\)$/.test(c);
  const painted = (roots) => {
    const rects = [];
    const walk = (el) => {
      if (el.matches('.sr-only, [data-slot$="-close"]')) return;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return;
      const r = el.getBoundingClientRect();
      const edged = ["Top", "Right", "Bottom", "Left"].some(
        (side) =>
          Number.parseFloat(cs[`border${side}Width`]) > 0 &&
          !clear(cs[`border${side}Color`]),
      );
      const replaced = /^(input|textarea|select|img|svg)$/i.test(el.tagName);
      if (
        r.width > 1 &&
        r.height > 1 &&
        (edged || replaced || !clear(cs.backgroundColor))
      )
        rects.push(r);
      for (const node of el.childNodes) {
        if (node.nodeType === 1) walk(node);
        else if (node.nodeType === 3 && node.textContent.trim()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const text = range.getBoundingClientRect();
          if (text.width > 1) rects.push(text);
        }
      }
    };
    for (const root of roots) walk(root);
    return rects;
  };
  const header = popup.querySelector('[data-slot$="-header"]');
  const footer = popup.querySelector('[data-slot$="-footer"]');
  // body = everything in the popup that is neither the header nor the footer
  const bodyRoots = [];
  const collect = (el) => {
    for (const child of el.children) {
      if (child === header || child === footer) continue;
      if (child.contains(header) || child.contains(footer)) collect(child);
      else bodyRoots.push(child);
    }
  };
  collect(popup);
  const px = (n) => Math.round(n * 10) / 10;
  const span = (rects) =>
    rects.length
      ? {
          l: px(Math.min(...rects.map((r) => r.left)) - left),
          r: px(right - Math.max(...rects.map((r) => r.right))),
        }
      : null;
  const h = header ? span(painted([...header.children])) : null;
  const f = footer ? span(painted([...footer.children])) : null;
  const b = span(painted(bodyRoots));
  return {
    // sticky bars must be filled, or the body scrolls visibly behind them
    // (a confirmation's header is inline message text, not a bar)
    bars_opaque: [header, footer]
      .filter((el) => el && getComputedStyle(el).position === "sticky")
      .every((el) => !clear(getComputedStyle(el).backgroundColor)),
    width: Math.round(box.width),
    radius: getComputedStyle(popup).borderTopLeftRadius,
    header_h: header ? Math.round(header.getBoundingClientRect().height) : null,
    footer_h: footer ? Math.round(footer.getBoundingClientRect().height) : null,
    header_inset: h?.l ?? null,
    body_left: b?.l ?? null,
    body_right: b?.r ?? null,
    footer_inset: f?.r ?? null,
  };
};
const DESKTOP = { width: 1440, height: 900 };
const openFieldOptions = (p) =>
  p.getByRole("button", { name: "Add field" }).first().click();
const GUTTER = {
  bars_opaque: true,
  header_inset: 16,
  body_left: 16,
  body_right: 16,
  radius: "10px",
};
// [shot, theme, viewport, open, want] — every key in `want` must measure equal;
// a missing measurement (null) fails too.
const OVERLAY_STATES = [
  [
    "dialog-field-options--desktop-dark",
    "dark",
    DESKTOP,
    openFieldOptions,
    { ...GUTTER, footer_inset: 16, width: 560, header_h: 44, footer_h: 52 },
  ],
  [
    "dialog-field-options--desktop-light",
    "light",
    DESKTOP,
    openFieldOptions,
    { ...GUTTER, footer_inset: 16, width: 560, header_h: 44, footer_h: 52 },
  ],
  [
    "dialog-field-options--phone-dark",
    "dark",
    { width: 390, height: 844 },
    openFieldOptions,
    { ...GUTTER, footer_inset: 16, width: 390 },
  ],
  [
    "dialog-create-table--desktop-dark",
    "dark",
    DESKTOP,
    (p) => p.getByRole("button", { name: "Create table" }).first().click(),
    { ...GUTTER, footer_inset: 16, width: 400, footer_h: 52 },
  ],
  [
    "dialog-create-board--desktop-dark",
    "dark",
    DESKTOP,
    (p) => p.getByRole("button", { name: "Add board" }).first().click(),
    { ...GUTTER, footer_inset: 16, width: 400, header_h: 44, footer_h: 52 },
  ],
  [
    "dialog-confirm--desktop-dark",
    "dark",
    DESKTOP,
    async (p) => {
      await p.getByRole("button", { name: "Tickets field menu" }).click();
      await p.getByRole("menuitem", { name: "Change field type" }).click();
      await p.getByRole("menuitem", { name: "Text", exact: true }).click();
    },
    {
      bars_opaque: true,
      header_inset: 16,
      footer_inset: 16,
      width: 400,
      footer_h: 52,
      radius: "10px",
    },
  ],
  [
    "sheet-row--phone-dark",
    "dark",
    { width: 390, height: 844 },
    (p) => p.getByRole("button", { name: "Expand row 1", exact: true }).click(),
    { bars_opaque: true, header_h: 44 },
  ],
  [
    "sheet-row--desktop-dark",
    "dark",
    DESKTOP,
    (p) => p.getByRole("button", { name: "Expand row 1", exact: true }).click(),
    {
      bars_opaque: true,
      header_inset: 16,
      body_left: 16,
      body_right: 16,
      width: 480,
      header_h: 44,
    },
  ],
];
if (pages.table) {
  for (const [name, theme, viewport, open, want] of OVERLAY_STATES) {
    const ctx = await browser.newContext({
      viewport,
      storageState: state,
      reducedMotion: "reduce",
      colorScheme: theme,
      hasTouch: viewport.width < 600,
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
    const fails = [];
    page.on("pageerror", (e) => fails.push(String(e)));
    await page.goto(BASE + pages.table, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    try {
      await open(page);
      await page.waitForTimeout(700);
      await page.mouse.move(2, 2);
    } catch (e) {
      fails.push(`interaction failed: ${String(e).split("\n")[0]}`);
    }
    const m = (await page.evaluate(overlayGeometry)) ?? {};
    for (const [key, value] of Object.entries(want))
      if (m[key] !== value)
        fails.push(`${key} ${m[key] ?? "not measured"}, want ${value}`);
    if (name.startsWith("sheet-row")) {
      // Ticket-drawer layout: one close button, the row's history, row n of N.
      const d = await page.evaluate(() => {
        const popup = document.querySelector('[data-slot="sheet-popup"]');
        const text = popup?.innerText ?? "";
        return {
          closes: popup?.querySelectorAll('[aria-label="Close"]').length ?? 0,
          activity: /created row/.test(text),
          position: /\b1 of 4\b/.test(text),
        };
      });
      if (d.closes !== 1 || !d.activity || !d.position)
        fails.push(`row drawer ${JSON.stringify(d)}`);
      const markdown = await page
        .getByRole("heading", { name: "Retest", exact: true })
        .count();
      if (!markdown) fails.push("long text did not render a Markdown heading");
      const layout = await page.evaluate(() => {
        const popup = document.querySelector('[data-slot="sheet-popup"]');
        if (!popup) return { overflow: true };
        const bounds = popup.getBoundingClientRect();
        return {
          overflow: [
            ...popup.querySelectorAll(
              'input, textarea, [data-slot="row-fields"] a',
            ),
          ].some((el) => el.getBoundingClientRect().right > bounds.right + 1),
        };
      });
      if (layout.overflow)
        fails.push("row drawer content spills outside its panel");
      if (name === "sheet-row--desktop-dark") {
        // Dragging the left edge widens the drawer, like the ticket drawer.
        const panel = page.locator('[data-slot="sheet-popup"]');
        const before = (await panel.boundingBox())?.width ?? 0;
        const handle = await page
          .getByTestId("row-drawer-resize-handle")
          .boundingBox();
        if (!handle) fails.push("row drawer has no resize handle");
        else {
          await page.mouse.move(handle.x + 2, handle.y + 200);
          await page.mouse.down();
          await page.mouse.move(handle.x - 200, handle.y + 200, { steps: 5 });
          await page.mouse.up();
          const after = (await panel.boundingBox())?.width ?? 0;
          if (after < before + 150)
            fails.push(`row drawer did not resize (${before} -> ${after})`);
          await page.evaluate(() => localStorage.clear());
        }
      }
      if (
        !(await page
          .getByRole("button", { name: "Submit comment", exact: true })
          .count())
      )
        fails.push("row comment composer missing");
      const refs = await page
        .locator('[data-slot="row-fields"] a')
        .evaluateAll((links) =>
          links.map((a) => {
            const r = a.getBoundingClientRect();
            return {
              left: r.left,
              right: r.right,
              top: r.top,
              bottom: r.bottom,
            };
          }),
        );
      for (let i = 1; i < refs.length; i++)
        if (
          refs[i].top < refs[i - 1].bottom &&
          refs[i].left < refs[i - 1].right
        )
          fails.push("ticket keys overlap in the drawer");
    }
    const shot = `${name}.png`;
    await page.screenshot({ path: join(OUT, shot) });
    checks[shot] = { fails, ...m };
    console.log(
      `${fails.length ? "FAIL" : "ok  "} ${shot} ${JSON.stringify(m)}${fails.length ? `\n      ${fails.join("\n      ")}` : ""}`,
    );
    await ctx.close();
  }
} else console.log("SKIP overlay states: the table page is not in PAGES");

await browser.close();
writeFileSync(join(OUT, "checks.json"), JSON.stringify(checks, null, 1));
const bad = Object.values(checks).reduce((n, c) => n + c.fails.length, 0);
console.log(`${Object.keys(checks).length} shots · ${bad} failures`);
process.exit(bad ? 1 : 0);
