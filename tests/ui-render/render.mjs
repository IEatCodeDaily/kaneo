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
        description: title.startsWith("Filter housing")
          ? "Pressure control inspection on the pilot line. Replace the gasket before retesting."
          : "seeded",
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
  let firstRowId = "";
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
    }).then((row) => {
      if (i === 0) firstRowId = row.id;
    });
  // Explicit row ↔ ticket link: the Resources list must render it as the
  // row's primary value + table name — its stored externalId is the row's
  // raw id, which must never surface (#fskd8… regression).
  await post(
    `/data-table/organization/${org.id}/${tbl.id}/rows/${firstRowId}/tickets?taskId=${tasks[0].id}`,
    {},
  );
  const invoices = await post(`/data-table/organization/${org.id}`, {
    name: "Invoice",
  });
  const customers = await post(`/data-table/organization/${org.id}`, {
    name: "Customer",
  });
  const invoiceNumber = await post(
    `/data-table/organization/${org.id}/${invoices.id}/fields`,
    { name: "Invoice number", type: "text" },
  );
  const customerNumber = await post(
    `/data-table/organization/${org.id}/${customers.id}/fields`,
    { name: "Customer number", type: "text" },
  );
  const customer = await post(
    `/data-table/organization/${org.id}/${customers.id}/rows`,
    { values: { [customerNumber.id]: "CUST-001 · Acme Manufacturing" } },
  );
  const relation = await post(
    `/data-table/organization/${org.id}/${invoices.id}/fields`,
    {
      name: "Customer",
      type: "link",
      options: {
        targetTableId: customers.id,
        inverseName: "Invoices",
        cardinality: "many-to-one",
      },
    },
  );
  await post(`/data-table/organization/${org.id}/${invoices.id}/rows`, {
    values: {
      [invoiceNumber.id]: "INV-2026-001",
      [relation.id]: [customer.id],
    },
  });
  return { org, board, tbl, tasks, invoices, customers };
}

await healthy();
const api = await request.newContext();
const { org, board, tbl, tasks, invoices, customers } = await seed(api);
const state = await api.storageState();
const slug = org.slug;
let pages = {
  board: `/dashboard/organization/${slug}/board/${board.slug ?? "KFL"}/board`,
  "my-tickets": `/dashboard/organization/${slug}/my-tasks`,
  inbox: `/dashboard/organization/${slug}/inbox`,
  table: `/dashboard/organization/${slug}/table/${tbl.id}`,
  "table-link-picker": `/dashboard/organization/${slug}/table/${invoices.id}`,
  "table-link-reciprocal": `/dashboard/organization/${slug}/table/${customers.id}`,
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

// Theme acceptance fixtures: reproduce the owner's 31 / 2 + 50 sidebar.
async function themeInboxFixtures(ctx) {
  await ctx.route("**/api/notification/unread-count", (route) =>
    route.fulfill({ json: { count: 31 } }),
  );
  await ctx.route("**/api/task/my-tasks?*", (route) =>
    route.fulfill({
      json: Array.from({ length: 50 }, (_, i) => ({
        ...tasks[0],
        id: `assigned-${i}`,
      })),
    }),
  );
  await ctx.route("**/api/flag/mine?*", (route) =>
    route.fulfill({
      json: [
        { taskId: tasks[0].id, resolvedAt: null },
        { taskId: tasks[1].id, resolvedAt: null },
      ],
    }),
  );
  await ctx.route("**/api/notification", (route) =>
    route.fulfill({
      json: tasks.slice(0, 3).map((task, i) => ({
        id: `theme-notification-${i}`,
        type: "task_updated",
        title: "Ticket updated",
        content: null,
        resourceType: "task",
        resourceId: task.id,
        isRead: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        eventData: {
          boardId: board.id,
          boardName: board.name,
          boardSlug: "KFL",
          organizationId: org.id,
          taskTitle: task.title,
          taskNumber: i + 1,
          taskStatusSlug: task.status,
          actorName: "Ayu Saraswati",
        },
      })),
    }),
  );
  await ctx.addInitScript(
    ({ slug, boardSlug }) => {
      const key = "user-preferences";
      const cur = JSON.parse(
        localStorage.getItem(key) ?? '{"state":{},"version":0}',
      );
      cur.state = {
        ...cur.state,
        recentOpen: false,
        recentPageLimit: 5,
        recentPages: Array.from({ length: 5 }, (_, i) => ({
          pathname: `/dashboard/organization/${slug}/board/${boardSlug}/board?recent=${i}`,
          label: "Pilot line",
          openedAt: Date.now() - i * 60000,
        })),
      };
      localStorage.setItem(key, JSON.stringify(cur));
    },
    { slug, boardSlug: board.slug ?? "KFL" },
  );
}

function themeContrast() {
  const css = getComputedStyle(document.documentElement);
  const rgb = (name) => {
    const color = css.getPropertyValue(name).trim();
    if (!color || !CSS.supports("color", color))
      throw new Error(`invalid theme token ${name}: ${color}`);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  };
  const luminance = (name) => {
    const [r, g, b] = rgb(name).map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const [x, y] = [luminance(a), luminance(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  return {
    primary: css.getPropertyValue("--primary").trim(),
    buttonContrast: contrast("--primary-foreground", "--primary"),
    mutedContrast: contrast("--muted-foreground", "--background"),
    chromeSpread: Math.max(
      ...["--primary", "--ring", "--accent", "--row-selected"].map(
        (name) => Math.max(...rgb(name)) - Math.min(...rgb(name)),
      ),
    ),
  };
}

function navBadgeGeometry() {
  const ids = [
    "inbox-unread-badge",
    "my-tasks-flagged-badge",
    "my-tasks-count-badge",
  ];
  const badges = ids.map((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) return { id, missing: true };
    const rect = el.getBoundingClientRect();
    const row = el.closest("button");
    const label = row?.querySelector(":scope > span");
    const slot = el.closest('[data-slot="nav-trailing"]');
    const style = getComputedStyle(el);
    return {
      id,
      text: el.textContent.trim(),
      left: rect.left,
      right: rect.right,
      height: rect.height,
      width: rect.width,
      labelRight: label?.getBoundingClientRect().right,
      slotRight: slot?.getBoundingClientRect().right,
      rowRight: row?.getBoundingClientRect().right,
      radius: style.borderRadius,
      bg: style.backgroundColor,
      color: style.color,
      border: style.borderTopColor,
    };
  });
  return badges;
}

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
    if (name === "inbox") await themeInboxFixtures(ctx);
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
    if (name === "table-link-picker" || name === "table-link-reciprocal") {
      const expected =
        name === "table-link-picker"
          ? "CUST-001 · Acme Manufacturing"
          : "INV-2026-001";
      await page
        .locator("[data-link-chip]")
        .filter({ hasText: expected })
        .waitFor();
      if (
        !(await page
          .locator("[data-link-chip]")
          .filter({ hasText: expected })
          .count())
      )
        fails.push("Primary value chip missing");
      await page
        .getByRole("button", { name: "Linked records", exact: true })
        .first()
        .click();
      const picker = page.locator("[data-link-picker]");
      await picker
        .getByRole("option", { name: new RegExp(expected.split(" · ")[0]) })
        .first()
        .waitFor();
      // The preview renders immediately; edit controls arrive after mutual-access lookup.
      await picker.getByRole("button", { name: /Unlink/ }).waitFor();
      if ((await picker.getByRole("button", { name: /Unlink/ }).count()) !== 1)
        fails.push("Selected record not removable");
      await page.waitForTimeout(600);
      const geometry = await picker.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, viewport: innerWidth };
      });
      if (geometry.left < 0 || geometry.right > geometry.viewport)
        fails.push("Link picker outside viewport");
      const visible = await picker.innerText();
      if (visible.includes(invoices.id) || visible.includes(customers.id))
        fails.push("Opaque identifier in picker");
      if (name === "table-link-picker") {
        await picker.getByRole("textbox").fill("no-such-record");
        await picker
          .getByText("No matching records", { exact: true })
          .waitFor();
        await picker.getByRole("textbox").fill("");
        await picker
          .getByRole("option", { name: new RegExp(expected.split(" · ")[0]) })
          .first()
          .waitFor();
      }
      // Search refresh keeps the selected preview mounted while authorization reloads.
      await picker.getByRole("status").waitFor({ state: "hidden" });
      await picker.getByRole("button", { name: /Unlink/ }).waitFor();
      await page.waitForTimeout(600);
    }
    // Resource toolbar acceptance: real phone geometry, not just screenshots.
    if (name === "table" || name === "board") {
      const toolbar = await page.evaluate((surface) => {
        const root = document.querySelector(
          surface === "table"
            ? '[data-slot="layout-toolbar"]'
            : '[data-testid="board-toolbar"]',
        );
        if (!root) return null;
        // Hidden controls (responsive collapse) have zero rects; they are not
        // toolbar chrome at this width and would break top-alignment probes.
        const controls = [...root.querySelectorAll("button, input")]
          .filter((el) => el.getBoundingClientRect().width > 0)
          .map((el) => {
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
          });
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
    // Raw ids are storage keys: a cuid/UUID must never appear in the drawer's
    // visible text (a table-row resource used to print `#<row id>`).
    if (name === "ticket") {
      const idLeak = text.match(
        /\b[a-z0-9]{20,}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
      );
      if (idLeak) fails.push(`raw id visible in drawer: ${idLeak[0]}`);
      const rowResource = await page
        .getByTestId("table-row-resource-link")
        .first()
        .innerText()
        .catch(() => "");
      if (
        !rowResource.includes("PB-1042") ||
        !rowResource.includes("Pilot batch log")
      )
        fails.push(
          `table-row resource not rendered as row value + table name: ${JSON.stringify(rowResource)}`,
        );
      if (tag === "desktop") {
        // Included-in labels must top-align with their value's first line
        // (they used to center against stacked chips / rich text). The
        // section mounts progressively — wait for its LAST field value.
        let mounted = true;
        try {
          await page
            .getByText("Record the result")
            .first()
            .waitFor({ timeout: 8000 });
        } catch {
          mounted = false;
        }
        await page.waitForTimeout(300);
        const probeFn = () => {
          const rows = [
            ...document.querySelectorAll('[data-slot="included-in-row"]'),
          ];
          const out = [];
          const heights = [];
          for (const row of rows) {
            // One wrapper holds breadcrumb + every field row; measure each
            // field row, not the wrapper's first match.
            for (const child of row.children) {
              const label = child.querySelector("[data-included-label]");
              const value = child.querySelector("[data-included-value]");
              if (!label || !value) continue; // breadcrumb row
              const lv = label.getBoundingClientRect();
              const vv = value.getBoundingClientRect();
              heights.push(
                `${label.textContent?.trim()}:${Math.round(vv.height)}`,
              );
              // Only multi-line values expose the centering drift.
              if (vv.height > 28)
                out.push(Math.round((vv.top - lv.top) * 10) / 10);
            }
          }
          return { rows: rows.length, heights, deltas: out };
        };
        // The section settles progressively; measure once it stops changing.
        let probe = await page.evaluate(probeFn);
        for (
          let attempt = 0;
          attempt < 10 && probe.deltas.length === 0;
          attempt++
        ) {
          await page.waitForTimeout(400);
          probe = await page.evaluate(probeFn);
        }
        if (probe.deltas.length === 0) {
          const detail = await page.evaluate(() => {
            const rows = [
              ...document.querySelectorAll('[data-slot="included-in-row"]'),
            ];
            return rows.map((row) => ({
              fieldRows: [...row.children].map((child) => ({
                label:
                  child
                    .querySelector("[data-included-label]")
                    ?.textContent?.trim() ?? null,
                hasValue: !!child.querySelector("[data-included-value]"),
                h: Math.round(child.getBoundingClientRect().height),
                cls: (child.className || "").slice(0, 60),
              })),
            }));
          });
          fails.push(
            `no multi-line included-in value (mounted=${mounted}, probe=${JSON.stringify(probe)}, detail=${JSON.stringify(detail)})`,
          );
        }
        for (const d of probe.deltas)
          if (Math.abs(d) > 2)
            fails.push(`included-in label/value tops off by ${d}px`);
      }
    }
    const palette = await page.evaluate(themeContrast);
    if (palette.buttonContrast < 4.5 || palette.mutedContrast < 4.5)
      fails.push(`theme contrast ${JSON.stringify(palette)}`);
    if (palette.chromeSpread > 24)
      fails.push(`saturated chrome ${JSON.stringify(palette)}`);
    const wantPrimary = theme === "dark" ? "#e7eaf0" : "#20252c";
    if (palette.primary !== wantPrimary)
      fails.push(`primary ${palette.primary}, want ${wantPrimary}`);
    m.palette = palette;
    const shot = `${name}--${tag}-${theme}.png`;
    await page.screenshot({ path: join(OUT, shot) });
    checks[shot] = { ...checks[shot], fails, ...m, url: page.url() };
    console.log(
      `${fails.length ? "FAIL" : "ok  "} ${shot} ${JSON.stringify(m)}${fails.length ? `\n      ${fails.join("\n      ")}` : ""}`,
    );
    if (name === "inbox") {
      if (tag === "phone") {
        await page.getByTestId("mobile-sidebar-toggle").first().click();
        await page.waitForTimeout(600);
      }
      const badges = await page.evaluate(navBadgeGeometry);
      const badgeFails = [];
      for (const badge of badges) {
        if (
          badge.missing ||
          badge.height !== 16 ||
          badge.width < 24 ||
          badge.width <= badge.height
        )
          badgeFails.push(`missing/non-pill count ${JSON.stringify(badge)}`);
        if (
          !badge.missing &&
          (badge.left < badge.labelRight + 4 ||
            badge.right > badge.rowRight ||
            badge.slotRight > badge.rowRight)
        )
          badgeFails.push(`badge clips label/row ${JSON.stringify(badge)}`);
      }
      const [inbox, flagged, assigned] = badges;
      if (flagged.right + 4 > assigned.left)
        badgeFails.push("flagged and assigned overlap or lack a 4px gap");
      if ([assigned].some((badge) => Math.abs(badge.right - inbox.right) > 1))
        badgeFails.push("nav badge right edges do not align");
      if (
        new Set([inbox, assigned].map((b) => `${b.bg}:${b.color}:${b.radius}`))
          .size !== 1
      )
        badgeFails.push("nav count styles differ");
      if (flagged.bg === assigned.bg || flagged.border === flagged.bg)
        badgeFails.push("attention badge lacks a distinct outline");
      if (badges.map((b) => b.text).join(",") !== "31,2,50")
        badgeFails.push("theme count fixtures did not load");
      const navShot = `nav-badges--${tag}-${theme}.png`;
      await page.screenshot({ path: join(OUT, navShot) });
      checks[navShot] = { fails: badgeFails, badges };
      console.log(
        `${badgeFails.length ? "FAIL" : "ok  "} ${navShot}${badgeFails.length ? `\n      ${badgeFails.join("\n      ")}` : ""}`,
      );
    }
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
    fails.push(
      `interaction failed: ${String(e).split("\n").slice(0, 3).join(" | ")}`,
    );
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

// Sidebar hover/active contract states (dark + light desktop): the section
// header is ink-only chrome (rest fainter than items, hover steps to item
// ink, active steps to full ink + semibold — never a fill), items keep the
// sidebar-accent pill, and the header carries the section fallback when the
// active item is hidden ("Hide from sidebar" driven through the real menu).
// Computed-style asserts so a dead class fails the gate instead of shipping.
for (const [tag, scheme] of [
  ["dark", "dark"],
  ["light", "light"],
]) {
  const headerInfo = `(() => {
    const pick = (label) =>
      [...document.querySelectorAll('[data-sidebar="group-label"]')].find(
        (el) => el.textContent?.trim() === label,
      );
    const el = pick("Boards");
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      color: cs.color,
      opaque: cs.color.startsWith("rgb("),
      bg: cs.backgroundColor,
      bgTransparent: cs.backgroundColor === "rgba(0, 0, 0, 0)",
      weight: cs.fontWeight,
      active: el.getAttribute("data-active"),
    };
  })()`;
  for (const [shot, run] of [
    [
      `sidebar-header-hover--desktop-${tag}.png`,
      async (page) => {
        const fails = [];
        await page.goto(BASE + pages.board, { waitUntil: "networkidle" });
        await page.waitForTimeout(1200);
        const rest = await page.evaluate(headerInfo);
        if (!rest) fails.push("Boards section header not found");
        const header = page
          .locator('[data-sidebar="group-label"]', { hasText: "Boards" })
          .first();
        await header.hover();
        await page.waitForTimeout(350);
        const hovered = await page.evaluate(headerInfo);
        if (rest && hovered) {
          if (hovered.color === rest.color)
            fails.push(
              `header hover did not step ink up: rest=${rest.color} hover=${hovered.color}`,
            );
          if (!hovered.bgTransparent)
            fails.push(
              `header hover painted a fill (${hovered.bg}) — headers are ink-only`,
            );
        }
        return { fails, rest, hovered };
      },
    ],
    [
      `sidebar-item-hover--desktop-${tag}.png`,
      async (page) => {
        const fails = [];
        await page.goto(BASE + pages.board, { waitUntil: "networkidle" });
        await page.waitForTimeout(1200);
        const row = page
          .locator('[data-slot="sidebar-menu-button"]:visible', {
            hasText: board.name,
          })
          .first();
        if ((await row.count()) === 0) fails.push("board row not visible");
        await row.hover();
        await page.waitForTimeout(350);
        const bg = await row.evaluate(
          (el) => getComputedStyle(el).backgroundColor,
        );
        if (bg === "rgba(0, 0, 0, 0)")
          fails.push(`item hover painted no pill fill (bg=${bg})`);
        return { fails, item_hover_bg: bg };
      },
    ],
    [
      `sidebar-section-active--desktop-${tag}.png`,
      async (page) => {
        const fails = [];
        await page.goto(BASE + `/dashboard/organization/${slug}`, {
          waitUntil: "networkidle",
        });
        await page.waitForTimeout(1200);
        const m = await page.evaluate(headerInfo);
        if (!m) fails.push("Boards section header not found");
        else {
          if (m.active !== "true")
            fails.push(
              `boards overview should carry the section fallback, data-active=${m.active}`,
            );
          if (m.weight !== "600")
            fails.push(`active header weight ${m.weight}, want 600`);
          if (!m.opaque) fails.push(`active header ink not full: ${m.color}`);
          if (!m.bgTransparent)
            fails.push(`active header painted a fill (${m.bg})`);
        }
        const rows = await page.evaluate(
          `(() => {
            const rows = [...document.querySelectorAll('[data-slot="sidebar-menu-button"]')]
              .filter((el) => el.offsetParent !== null && el.textContent?.trim().includes(${JSON.stringify(board.name)}));
            return rows.length;
          })()`,
        );
        if (rows < 1)
          fails.push(
            "active-with-children: no visible board row under the active header",
          );
        return { fails, header: m, visible_board_rows: rows };
      },
    ],
    [
      `sidebar-section-fallback--desktop-${tag}.png`,
      async (page) => {
        const fails = [];
        await page.goto(BASE + pages.board, { waitUntil: "networkidle" });
        await page.waitForTimeout(1200);
        await page
          .locator('[data-slot="sidebar-menu-button"]:visible', {
            hasText: board.name,
          })
          .first()
          .hover();
        await page
          .getByRole("button", { name: "Board sidebar options" })
          .click();
        await page.getByText("Hide from sidebar").click();
        await page.waitForTimeout(600);
        const m = await page.evaluate(headerInfo);
        if (!m) fails.push("Boards section header not found after hide");
        else if (m.active !== "true")
          fails.push(
            `section fallback did not light the header after hiding the active item, data-active=${m.active}`,
          );
        const rows = await page.evaluate(
          `(() => {
            const rows = [...document.querySelectorAll('[data-slot="sidebar-menu-button"]')]
              .filter((el) => el.offsetParent !== null && el.textContent?.trim().includes(${JSON.stringify(board.name)}));
            return rows.length;
          })()`,
        );
        if (rows !== 0)
          fails.push(`hidden board row still rendered (${rows} visible)`);
        return { fails, header: m, visible_board_rows: rows };
      },
    ],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      storageState: state,
      reducedMotion: "reduce",
      colorScheme: scheme,
    });
    await ctx.addInitScript((t) => {
      const k = "user-preferences";
      const cur = JSON.parse(
        localStorage.getItem(k) ?? '{"state":{},"version":0}',
      );
      cur.state = { ...cur.state, theme: t };
      localStorage.setItem(k, JSON.stringify(cur));
    }, scheme);
    const page = await ctx.newPage();
    const fails = [];
    page.on("pageerror", (e) => fails.push(String(e)));
    let measured = {};
    try {
      measured = await run(page);
      fails.push(...(measured.fails ?? []));
    } catch (e) {
      fails.push(
        `state failed: ${String(e).split("\n").slice(0, 3).join(" | ")}`,
      );
    }
    await page.screenshot({ path: join(OUT, shot) });
    checks[shot] = { fails, ...measured };
    console.log(
      `${fails.length ? "FAIL" : "ok  "} ${shot} ${JSON.stringify(measured)}${fails.length ? `\n      ${fails.join("\n      ")}` : ""}`,
    );
    await ctx.close();
  }
}

async function showSystemFields(page) {
  await page.getByRole("button", { name: /^Fields/ }).click();
  await page
    .getByRole("switch", { name: "Show system fields", exact: true })
    .click();
  // Keep all five system columns in the desktop frame without shrinking text.
  for (const name of ["Stage", "Cost", "Start date", "Note", "Tickets"]) {
    const toggle = page.getByRole("switch", { name, exact: true });
    if (await toggle.count()) await toggle.uncheck();
  }
  await page.keyboard.press("Escape");
  for (const name of [
    "Row ID",
    "Created at",
    "Updated at",
    "Created by",
    "Updated by",
  ]) {
    await page
      .getByRole("button", { name: `${name} field menu`, exact: true })
      .waitFor();
  }
  const author = page.getByRole("gridcell", {
    name: "Created by, row 1",
    exact: true,
  });
  await author.getByText("Ayu Saraswati", { exact: true }).waitFor();
  if ((await author.getAttribute("aria-readonly")) !== "true")
    throw new Error("system cell is editable");
  const text = await page.getByRole("grid").innerText();
  if (/\b[a-z][a-z0-9]{23}\b|\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i.test(text))
    throw new Error("raw cuid/uuid in grid");
  // The preference must survive reload, not just a mounted component's state.
  await page.reload({ waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Created by field menu", exact: true })
    .waitFor();
}

let fullQueryFixture;
async function fullQueryState(page) {
  fullQueryFixture ??= (async () => {
    const post = async (path, data) => {
      const response = await page.request.post(
        `${BASE}/api/data-table/organization/${org.id}${path}`,
        { data, headers: { Origin: BASE } },
      );
      if (!response.ok())
        throw new Error(`full-query seed: ${await response.text()}`);
      return response.json();
    };
    const table = await post("", { name: "Complete batch log" });
    const field = await post(`/${table.id}/fields`, {
      name: "Batch",
      type: "text",
    });
    for (let n = 0; n < 1001; n++)
      await post(`/${table.id}/rows`, {
        values: {
          [field.id]:
            n === 1000 ? "Off-page batch found" : `Ordinary batch ${n + 1}`,
        },
      });
    return table;
  })();
  const table = await fullQueryFixture;
  await page.goto(BASE + pages.table.replace(tbl.id, table.id), {
    waitUntil: "networkidle",
  });
  await page
    .getByRole("button", { name: "Load more rows", exact: true })
    .waitFor();
  let release;
  let first = true;
  await page.route("**/row-query", async (route) => {
    if (!first) return route.continue();
    first = false;
    await new Promise((resolve) => {
      release = resolve;
    });
    await route.fulfill({ status: 503, body: "Query temporarily unavailable" });
  });
  await page.getByLabel("Search rows").fill("Off-page batch found");
  await page
    .getByRole("status")
    .filter({ hasText: "Querying all rows" })
    .waitFor();
  if (await page.getByText(/loaded.*matching.*total/).count())
    throw new Error("loading query still claims totals");
  await page.screenshot({
    path: join(
      OUT,
      `table-full-query-loading--${page.viewportSize().width < 600 ? "phone" : "desktop"}-${await page.evaluate(() => (document.documentElement.classList.contains("dark") ? "dark" : "light"))}.png`,
    ),
  });
  release();
  await page
    .getByRole("alert")
    .filter({ hasText: "Could not query rows" })
    .waitFor();
  if (await page.getByText("No rows match", { exact: true }).count())
    throw new Error("query error looks like empty results");
  await page.screenshot({
    path: join(
      OUT,
      `table-full-query-error--${page.viewportSize().width < 600 ? "phone" : "desktop"}-${await page.evaluate(() => (document.documentElement.classList.contains("dark") ? "dark" : "light"))}.png`,
    ),
  });
  await page.getByRole("button", { name: "Retry query", exact: true }).click();
  await page
    .getByRole("gridcell", { name: "Batch, row 1", exact: true })
    .filter({ hasText: "Off-page batch found" })
    .waitFor();
  await page
    .getByText("1 loaded · 1 matching · 1001 total", { exact: true })
    .waitFor();
  if (
    await page
      .getByRole("button", { name: "Load more rows", exact: true })
      .count()
  )
    throw new Error("off-page search needs Load more");
  const bounds = await page
    .getByText("1 loaded · 1 matching · 1001 total", { exact: true })
    .boundingBox();
  if (!bounds || bounds.x + bounds.width > page.viewportSize().width)
    throw new Error("query count clips viewport");
  await page.unroute("**/row-query");
}

async function filterGroupsState(page) {
  let lastFilters;
  const onRequest = (request) => {
    if (request.url().endsWith("/row-query") && request.method() === "POST")
      lastFilters = request.postDataJSON()?.filters;
  };
  page.on("request", onRequest);
  await page
    .getByRole("button", { name: "Batch field menu", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Filter by this field", exact: true })
    .click();
  const builder = page.locator("[data-filter-builder]");
  await builder.waitFor();
  if ((await builder.locator("[data-filter-condition]").count()) !== 1)
    throw new Error("Header filter action did not create a condition");
  await builder
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  const root = builder.locator('[data-filter-group="1"]');
  const add = async (group, text) => {
    await group
      .getByRole("button", { name: "Add filter", exact: true })
      .last()
      .click();
    await group.getByLabel("Filter value", { exact: true }).last().fill(text);
  };
  await add(root, "PB-1042 Filter test A");
  await root.getByRole("button", { name: "Add group", exact: true }).click();
  const nested = builder.locator('[data-filter-group="2"]');
  await nested.getByLabel("Group logic").click();
  await page.getByRole("option", { name: "OR", exact: true }).click();
  await add(nested, "PB-1042 Filter test A");
  await add(nested, "PB-1043 Mixing test B");
  await page.waitForTimeout(400);
  const filterButton = page.getByRole("button", { name: /^Filter/ });
  if (
    !(await filterButton.innerText()).includes("3") ||
    (await filterButton.getAttribute("data-applied")) !== "true"
  )
    throw new Error("Filter active count must be 3");
  if (
    lastFilters?.conjunction !== "and" ||
    lastFilters?.children?.[1]?.conjunction !== "or" ||
    lastFilters.children[1].children.length !== 2
  )
    throw new Error("Nested expression was flattened or not sent to row query");
  await nested
    .getByRole("button", { name: "Remove filter", exact: true })
    .last()
    .click();
  if ((await builder.locator("[data-filter-condition]").count()) !== 2)
    throw new Error("Remove condition failed");
  await nested.getByRole("button", { name: "Add group", exact: true }).click();
  const deepest = builder.locator('[data-filter-group="3"]');
  if (
    !(await deepest
      .getByRole("button", { name: "Add group", exact: true })
      .isDisabled())
  )
    throw new Error("Depth limit not enforced in builder");
  await deepest.getByRole("button", { name: "Remove group" }).click();
  await builder
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  if (
    (await builder.locator("[data-filter-condition]").count()) !== 0 ||
    (await builder.locator("[data-filter-group]").count()) !== 1
  )
    throw new Error("Clear all did not clear nested conditions");
  await add(root, "PB-1042 Filter test A");
  await root.getByRole("button", { name: "Add group", exact: true }).click();
  await nested.getByLabel("Group logic").click();
  await page.getByRole("option", { name: "OR", exact: true }).click();
  await add(nested, "PB-1042 Filter test A");
  await add(nested, "PB-1043 Mixing test B");
  await page.waitForTimeout(400);
  const overflow = await builder.evaluate((el) =>
    Array.from(
      el.querySelectorAll('button,input:not([aria-hidden="true"])'),
    ).flatMap((control) => {
      const r = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      return r.width > 2 &&
        r.height > 2 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        (r.left < 0 || r.right > window.innerWidth)
        ? [
            {
              label: control.getAttribute("aria-label") ?? control.textContent,
              left: r.left,
              right: r.right,
            },
          ]
        : [];
    }),
  );
  if (overflow.length)
    throw new Error(
      `Filter controls overflow viewport: ${JSON.stringify(overflow)}`,
    );
  await builder.locator(".overflow-y-auto").evaluate((el) => {
    el.scrollTop = 0;
  });
  page.off("request", onRequest);
}

// Table interaction states (dark desktop), design v3 S2.
// Each interaction state starts with its own persisted layout. A shared default
// would make earlier filter/height/visibility tests contaminate later states.
async function freshGridUrl() {
  const r = await api.post(
    `${BASE}/api/data-table/organization/${org.id}/${tbl.id}/views`,
    {
      data: {
        name: "Grid",
        config: {
          filters: [],
          sort: null,
          groupFieldId: null,
          hiddenFields: [],
          fieldOrder: [],
          columnWidths: {},
          rowHeight: "compact",
          frozenColumns: 0,
          summaries: {},
          showSystemFields: false,
        },
      },
    },
  );
  if (!r.ok()) throw new Error(`create render view: ${await r.text()}`);
  return `${BASE}${pages.table}?v=${(await r.json()).id}`;
}
const TABLE_STATES = [
  [
    "table-saved-views",
    async (p) => {
      const switcher = p.getByRole("button", {
        name: "Switch saved view",
        exact: true,
      });
      const original = p.url();
      const viewName = p.viewportSize().width < 768 ? "QA phone" : "QA review";
      await switcher.click();
      await p
        .getByRole("menuitem", { name: "Create view", exact: true })
        .click();
      await p.getByRole("textbox", { name: "View name" }).fill(viewName);
      await p.getByRole("button", { name: "Create view", exact: true }).click();
      await p.waitForURL((url) => url.href !== original);
      await p.getByRole("grid").waitFor();
      const second = p.url();
      await p.getByRole("button", { name: "Table options" }).click();
      const saved = p.waitForResponse(
        (r) =>
          r.request().method() === "PUT" &&
          r.url().includes("/views/") &&
          r.ok(),
      );
      await p
        .getByRole("menuitemcheckbox", { name: "Tall", exact: true })
        .click();
      await saved;
      // Checkbox menu items intentionally keep the table-options menu open.
      await p.keyboard.press("Escape");
      await p.getByRole("button", { name: "Fields", exact: true }).click();
      const hidden = p.waitForResponse(
        (r) =>
          r.request().method() === "PUT" &&
          r.url().includes("/views/") &&
          r.ok(),
      );
      await p.getByRole("switch", { name: "Stage", exact: true }).click();
      await hidden;
      await p.keyboard.press("Escape");
      await p.goto(original, { waitUntil: "networkidle" });
      const geometry = () =>
        p.evaluate(() => ({
          height: document
            .querySelector('[role="row"][aria-rowindex]')
            ?.getBoundingClientRect().height,
          stage: [...document.querySelectorAll('[role="columnheader"]')].some(
            (e) => e.textContent.includes("Stage"),
          ),
        }));
      await p.getByRole("grid").waitFor();
      let m = await geometry();
      if (m.height !== 32 || !m.stage)
        throw new Error(`first view lost its layout: ${JSON.stringify(m)}`);
      // Switch by the actual header control, then reload the linkable URL.
      await switcher.click();
      await p.getByRole("menuitem", { name: viewName, exact: true }).click();
      await p.waitForURL(second);
      await p.reload({ waitUntil: "networkidle" });
      await p.getByRole("grid").waitFor();
      m = await geometry();
      if (m.height !== 80 || m.stage)
        throw new Error(`second view lost its layout: ${JSON.stringify(m)}`);
      await p
        .getByRole("button", { name: "View actions", exact: true })
        .click();
    },
  ],
  ["table-full-query", fullQueryState],
  ["table-filter-groups", filterGroupsState],
  ["table-system-fields", showSystemFields],
  [
    "table-system-drawer",
    async (page) => {
      await page
        .getByRole("button", { name: "Expand row 1", exact: true })
        .click();
      const system = page.locator('[data-slot="row-system-fields"]');
      if ((await system.getAttribute("open")) !== null)
        throw new Error("System section is not collapsed");
      await system.locator("summary").click();
      await system
        .getByText("Ayu Saraswati", { exact: true })
        .first()
        .waitFor();
    },
  ],
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
    // Multi-sort (NocoDB parity): two ordered rules drive one row-query.
    "table-multi-sort",
    async (p) => {
      const applied = p.waitForResponse((r) => {
        if (!r.url().includes("/row-query")) return false;
        try {
          const body = r.request().postDataJSON();
          return Array.isArray(body?.sort) && body.sort.length === 2;
        } catch {
          return false;
        }
      });
      await p.getByRole("button", { name: /^Sort/ }).click();
      await p.getByRole("button", { name: "Add sort" }).click();
      await p.getByRole("button", { name: "Add sort" }).click();
      const body = await (await applied).request().postDataJSON();
      if (body.sort[0].fieldId === body.sort[1].fieldId)
        throw new Error("multi-sort rules are not distinct");
    },
  ],
  [
    // Public form builder (nocodb-parity #10): manage-only dialog from the
    // table options menu.
    "table-public-form",
    async (p) => {
      await p.getByRole("button", { name: "Table options" }).click();
      await p.getByRole("menuitem", { name: "Public form" }).click();
      await p.getByText("Collect these fields").waitFor();
    },
  ],
  [
    // Anonymous public form page: published via the API, then visited with
    // the same context (the page itself needs no session).
    "public-form-page",
    async (p) => {
      // Publish through the real dialog UI: the endpoint contract is covered
      // by the API integration suite; here we exercise the user workflow.
      await p.getByRole("button", { name: "Table options" }).click();
      await p.getByRole("menuitem", { name: "Public form" }).click();
      await p.getByText("Collect these fields").waitFor();
      await p.getByRole("checkbox", { name: "Batch" }).check();
      const published = p.waitForResponse(
        (r) => r.url().includes("/form") && r.request().method() === "PUT",
      );
      await p.getByRole("button", { name: /^Publish/ }).click();
      const response = await published;
      if (!response.ok())
        throw new Error(
          `publish ${response.status()}: ${await response.text()}`,
        );
      const link = await p
        .getByRole("textbox", { name: "Share link" })
        .inputValue();
      const slug = link.split("/public-form/")[1];
      if (!slug) throw new Error("no share link after publish");
      await p.goto(`${BASE}/public-form/${slug}`, {
        waitUntil: "networkidle",
      });
      await p.getByRole("button", { name: "Submit" }).waitFor();
    },
  ],
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
      await p.getByRole("button", { name: "Create row", exact: true }).click();
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
        note?.text !== "Retest" ||
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
      // Freeze is opt-in now: by default no data column sticks, so the
      // primary scrolls away with the rest while the gutter holds the edge.
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
          cellSticky: getComputedStyle(cell).position,
          headSticky: getComputedStyle(hcell).position,
        };
      });
      if (
        geometry.sticky !== "sticky" ||
        Math.abs(geometry.gutter - geometry.headerGutter) > 1 ||
        Math.abs(geometry.primary - geometry.headerPrimary) > 1 ||
        geometry.cellSticky !== "relative" ||
        geometry.headSticky !== "relative"
      )
        throw new Error(`frozen geometry ${JSON.stringify(geometry)}`);
    },
  ],
  [
    // Freeze is opt-in via the header menu: freezing Cost pins Batch+Stage+Cost
    // (columns 0..N, spreadsheet-style) and they hold the left edge while the
    // rest scrolls; the choice persists across a reload.
    "table-freeze",
    async (p) => {
      await p.getByRole("button", { name: "Cost field menu" }).click();
      await p.getByRole("menuitem", { name: "Freeze column" }).click();
      await p.waitForTimeout(300);
      await p
        .getByRole("gridcell", { name: "Cost, row 1", exact: true })
        .click();
      // The grid is narrower than a 1440px viewport; shrink it so the scroll
      // below is real (sticky columns must hold, the rest must move).
      await p.setViewportSize({ width: 900, height: 900 });
      await p.waitForTimeout(300);
      const scroll = () =>
        p.getByRole("grid").evaluate((grid) => {
          let el = grid.parentElement;
          while (el && getComputedStyle(el).overflowX !== "auto")
            el = el.parentElement;
          if (!el) throw new Error("no grid scroller");
          el.scrollLeft = 500;
        });
      const geometry = () =>
        p.evaluate(() => {
          const row = document.querySelector('[role="row"][aria-rowindex]');
          const header = document.querySelector('[role="grid"] [role="row"]');
          const cellByName = (name) =>
            [...(row?.querySelectorAll('[role="gridcell"]') ?? [])].find((el) =>
              (el.getAttribute("aria-label") ?? "").startsWith(`${name}, `),
            );
          const headByName = (name) =>
            [...(header?.querySelectorAll('[role="columnheader"]') ?? [])].find(
              (el) => (el.innerText ?? "").startsWith(name),
            );
          const gutter = row?.querySelector('[role="rowheader"]');
          const headGutter = header?.querySelector('[role="columnheader"]');
          const batch = cellByName("Batch");
          const cost = cellByName("Cost");
          const start = cellByName("Start date");
          const headBatch = headByName("Batch");
          const headCost = headByName("Cost");
          if (!batch || !cost || !start || !headBatch || !headCost || !gutter)
            throw new Error("missing cells");
          let scroller = document.querySelector('[role="grid"]')?.parentElement;
          while (scroller && getComputedStyle(scroller).overflowX !== "auto")
            scroller = scroller.parentElement;
          return {
            scrollLeft: scroller?.scrollLeft ?? 0,
            gutter: gutter.getBoundingClientRect().left,
            headGutter: headGutter.getBoundingClientRect().left,
            batch: batch.getBoundingClientRect().left,
            headBatch: headBatch.getBoundingClientRect().left,
            cost: cost.getBoundingClientRect().left,
            headCost: headCost.getBoundingClientRect().left,
            batchSticky: getComputedStyle(batch).position,
            costSticky: getComputedStyle(cost).position,
            startSticky: getComputedStyle(start).position,
            pin: Boolean(headCost.querySelector("svg.lucide-pin")),
            // Sticky headers must be opaque, or scrolled headers show through.
            headBg: getComputedStyle(headCost).backgroundColor,
          };
        });
      const frozen = await geometry();
      await scroll();
      await p.waitForTimeout(300);
      const scrolled = await geometry();
      if (
        frozen.batchSticky !== "sticky" ||
        frozen.costSticky !== "sticky" ||
        frozen.startSticky !== "relative" ||
        Math.abs(frozen.gutter - frozen.headGutter) > 1 ||
        Math.abs(frozen.batch - frozen.headBatch) > 1 ||
        Math.abs(frozen.cost - frozen.headCost) > 1 ||
        Math.abs(frozen.batch - (frozen.gutter + 44)) > 1 ||
        !frozen.pin ||
        /rgba\([^)]*,\s*0(\.\d+)?\)|transparent/.test(frozen.headBg) ||
        // The scroll must be real, frozen columns must not move, and the
        // first unfrozen column must travel with the content.
        scrolled.scrollLeft < 100 ||
        Math.abs(scrolled.batch - frozen.batch) > 1 ||
        Math.abs(scrolled.cost - frozen.cost) > 1 ||
        Math.abs(scrolled.start - (frozen.start - scrolled.scrollLeft)) > 1
      )
        throw new Error(
          `freeze geometry ${JSON.stringify({ frozen, scrolled })}`,
        );
      await p.reload({ waitUntil: "networkidle" });
      await scroll();
      await p.waitForTimeout(300);
      const persisted = await geometry();
      if (persisted.batchSticky !== "sticky")
        throw new Error("freeze did not persist across reload");
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
  [
    // Spreadsheet keyboard (NocoDB parity): wrap, edge jumps, clear, replace.
    "table-keyboard",
    async (p) => {
      const grid = p.getByRole("grid");
      const activeLabel = () =>
        p.evaluate(() =>
          document
            .querySelector('[role="gridcell"][aria-selected="true"]')
            ?.getAttribute("aria-label"),
        );
      await p.getByRole("gridcell", { name: "Batch, row 1" }).click();
      await grid.press("Control+ArrowRight");
      if ((await activeLabel()) !== "Tickets, row 1")
        throw new Error("Ctrl+ArrowRight did not reach the last field");
      await grid.press("Control+ArrowLeft");
      if ((await activeLabel()) !== "Batch, row 1")
        throw new Error("Ctrl+ArrowLeft did not reach the first field");
      for (let i = 0; i < 6; i++) await grid.press("Tab");
      if ((await activeLabel()) !== "Batch, row 2")
        throw new Error("Tab did not wrap across rows");
      await grid.press("Shift+Tab");
      if ((await activeLabel()) !== "Tickets, row 1")
        throw new Error("Shift+Tab did not wrap back");
      // Typing replaces the active cell; Esc cancels without saving.
      await p.getByRole("gridcell", { name: "Note, row 1" }).click();
      await grid.press("x");
      const note = p.getByRole("textbox", { name: "Note", exact: true });
      if ((await note.inputValue()) !== "x")
        throw new Error("typing did not seed the editor with the keystroke");
      await note.press("Escape");
      await p
        .getByRole("textbox", { name: "Note", exact: true })
        .waitFor({ state: "detached" });
      // Delete clears an editable cell through the real API; typing restores.
      await p.getByRole("gridcell", { name: "Cost, row 1" }).click();
      await grid.press("Delete");
      await p.waitForFunction(
        () =>
          document
            .querySelector('[aria-label="Cost, row 1"]')
            ?.textContent?.trim() === "—",
      );
      await p.getByRole("gridcell", { name: "Cost, row 1" }).click();
      await grid.press("3");
      const cost = p.getByRole("spinbutton", { name: "Cost", exact: true });
      await cost.fill("3180000");
      await cost.press("Enter");
      // The commit is async: the editor must be gone (editing cleared) before
      // the next keys, or the Space below lands while the grid still holds an
      // open editor and is swallowed.
      await cost.waitFor({ state: "detached" });
      await p.waitForFunction(
        () =>
          document
            .querySelector('[aria-label="Cost, row 1"]')
            ?.textContent?.trim() !== "—",
      );
      // Space expands the row; Esc closes the drawer again.
      await p.getByRole("gridcell", { name: "Batch, row 1" }).click();
      await grid.press(" ");
      await p.locator('[data-slot="sheet-popup"]').waitFor({ timeout: 5000 });
      await p.keyboard.press("Escape");
      await p
        .locator('[data-slot="sheet-popup"]')
        .waitFor({ state: "detached" });
      // Outer boundary: Tab leaves the grid instead of clamping.
      await p
        .getByRole("gridcell", { name: /Tickets, row \d+/ })
        .last()
        .click();
      await grid.press("Tab");
      const left = await p.evaluate(
        () => document.activeElement?.getAttribute("role") !== "grid",
      );
      if (!left)
        throw new Error("Tab at the outer boundary did not leave the grid");
    },
  ],
  [
    // Row height (NocoDB parity): Tall wraps long text at a fixed height.
    "table-row-height",
    async (p) => {
      await p.getByRole("button", { name: "Table options" }).click();
      await p.getByRole("menuitemcheckbox", { name: "Tall" }).click();
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
    await page.goto(await freshGridUrl(), { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    try {
      await act(page);
      await page.waitForTimeout(500);
    } catch (e) {
      fails.push(
        `interaction failed: ${String(e).split("\n").slice(0, 3).join(" | ")}`,
      );
      await page.screenshot({
        path: join(OUT, `${name}--failure.png`),
        fullPage: false,
      });
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
    // The anonymous public form page has no app scaffold at all.
    if (name !== "public-form-page" && m.header_h !== 44)
      fails.push(`header ${m.header_h}px, want 44`);
    // History replaces the grid, so the grid geometry does not apply to it.
    if (name !== "table-history" && name !== "public-form-page") {
      if (!m.heads.some((x) => x.startsWith("Batch")))
        fails.push("field names missing from header");
      // Board toolbar buttons are 12px; the table matches them.
      if (m.toolbar_font !== "12px")
        fails.push(`toolbar font ${m.toolbar_font}, want 12px`);
      if (m.toolbar_h !== 40) fails.push(`toolbar ${m.toolbar_h}px, want 40`);
      if (
        name !== "table-noresult" &&
        name !== "table-row-height" &&
        name !== "table-saved-views" &&
        m.row_h !== 32
      )
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
    if (name === "table-keyboard") {
      const end = await page.evaluate(() => ({
        active: document
          .querySelector('[role="gridcell"][aria-selected="true"]')
          ?.getAttribute("aria-label"),
        sheet: !!document.querySelector('[data-slot="sheet-popup"]'),
        // The boundary Tab parks focus on the header's select-all checkbox:
        // that is focus leaving the grid, not a cell editor.
        editor: !!document.querySelector(
          '[role="grid"] input:not([type="checkbox"]), [role="grid"] textarea',
        ),
        cost: document
          .querySelector('[aria-label="Cost, row 1"]')
          ?.textContent?.trim(),
      }));
      if (!end.active?.startsWith("Tickets, row"))
        fails.push(`keyboard end active ${JSON.stringify(end)}`);
      if (end.sheet || end.editor)
        fails.push(`keyboard end left UI open ${JSON.stringify(end)}`);
      if (end.cost === "—")
        fails.push("cost cell was not restored after Delete");
    }
    if (name === "table-row-height") {
      const tall = await page.evaluate(() => {
        const row = document.querySelector(
          '[role="grid"] [role="row"][aria-rowindex]',
        );
        const preview = document.querySelector(
          '[aria-label="Note, row 1"] [data-expanded="false"]',
        );
        const rows = [
          ...document.querySelectorAll('[role="row"][aria-rowindex]'),
        ];
        let overlap = false;
        for (let i = 1; i < rows.length; i++) {
          const a = rows[i - 1].getBoundingClientRect();
          const b = rows[i].getBoundingClientRect();
          if (a.bottom > b.top + 1) overlap = true;
        }
        return {
          h: row ? Math.round(row.getBoundingClientRect().height) : null,
          clamp: preview ? getComputedStyle(preview).webkitLineClamp : null,
          overlap,
          overflow: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
      if (tall.h !== 80) fails.push(`tall row ${tall.h}px, want 80`);
      if (tall.clamp !== "3")
        fails.push(`note clamp ${tall.clamp}, want 3 lines`);
      if (tall.overlap) fails.push("rows overlap at tall height");
      if (tall.overflow) fails.push("tall rows overflow the viewport");
    }
    const shot = `${name}--desktop-dark.png`;
    await page.screenshot({ path: join(OUT, shot) });
    checks[shot] = { fails, ...m };
    console.log(
      `${fails.length ? "FAIL" : "ok  "} ${shot} ${JSON.stringify(m)}${fails.length ? `\n      ${fails.join("\n      ")}` : ""}`,
    );
    await ctx.close();
  }

  for (const [label, viewport, theme] of [
    ["phone-dark", { width: 390, height: 844 }, "dark"],
    ["desktop-light", { width: 1440, height: 900 }, "light"],
  ]) {
    const ctx = await browser.newContext({
      viewport,
      storageState: state,
      reducedMotion: "reduce",
      colorScheme: theme,
    });
    await ctx.addInitScript((theme) => {
      localStorage.setItem(
        "user-preferences",
        JSON.stringify({ state: { theme }, version: 0 }),
      );
    }, theme);
    const page = await ctx.newPage();
    const fails = [];
    page.on("pageerror", (e) => fails.push(String(e)));
    try {
      await fullQueryState(page);
    } catch (error) {
      fails.push(String(error).split("\n")[0]);
    }
    const shot = `table-full-query--${label}.png`;
    await page.screenshot({ path: join(OUT, shot) });
    checks[shot] = { fails };
    console.log(
      `${fails.length ? "FAIL" : "ok  "} ${shot} ${fails.join("; ")}`,
    );
    await ctx.close();
  }

  // Keyboard + row-height states must also hold at 390px (dark, touch).
  for (const [name, act] of [
    ...TABLE_STATES.filter(
      ([id]) =>
        id === "table-keyboard" ||
        id === "table-row-height" ||
        id === "table-filter-groups" ||
        id === "table-saved-views",
    ),
  ]) {
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
    await page.goto(await freshGridUrl(), { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    try {
      await act(page);
      await page.waitForTimeout(500);
    } catch (e) {
      fails.push(
        `interaction failed: ${String(e).split("\n").slice(0, 3).join(" | ")}`,
      );
    }
    const m = await page.evaluate(() => {
      const row = document.querySelector(
        '[role="grid"] [role="row"][aria-rowindex]',
      );
      return {
        row_h: row ? Math.round(row.getBoundingClientRect().height) : null,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        active: document
          .querySelector('[role="gridcell"][aria-selected="true"]')
          ?.getAttribute("aria-label"),
      };
    });
    if (name === "table-row-height" && m.row_h !== 80)
      fails.push(`phone tall row ${m.row_h}px, want 80`);
    if (name === "table-keyboard" && !m.active)
      fails.push("phone keyboard state lost the active cell");
    if (m.overflow) fails.push("state overflows the phone viewport");
    const shot = `${name}--phone-dark.png`;
    await page.screenshot({ path: join(OUT, shot) });
    checks[shot] = { fails, ...m };
    console.log(
      `${fails.length ? "FAIL" : "ok  "} ${shot} ${JSON.stringify(m)}`,
    );
    await ctx.close();
  }

  // Same controls on touch; horizontal scrolling brings the user columns into view.
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState: state,
      reducedMotion: "reduce",
      colorScheme: "dark",
      hasTouch: true,
    });
    await ctx.addInitScript(() => {
      const cur = JSON.parse(
        localStorage.getItem("user-preferences") ?? '{"state":{},"version":0}',
      );
      cur.state = { ...cur.state, theme: "dark" };
      localStorage.setItem("user-preferences", JSON.stringify(cur));
    });
    const page = await ctx.newPage();
    const fails = [];
    page.on("pageerror", (error) => fails.push(String(error)));
    await page.goto(await freshGridUrl(), { waitUntil: "networkidle" });
    try {
      // Exercise the existing resize control: a wide frozen primary leaves no
      // room for scrolling columns on phones. This is a local view preference.
      const resize = page.getByRole("separator", {
        name: "Resize Batch column",
        exact: true,
      });
      for (let step = 0; step < 14; step++) await resize.press("ArrowLeft");
      await showSystemFields(page);
      await page
        .getByRole("gridcell", { name: "Updated by, row 1", exact: true })
        .scrollIntoViewIfNeeded();
      const userCell = await page
        .getByRole("gridcell", { name: "Updated by, row 1", exact: true })
        .boundingBox();
      const primaryText = page
        .getByRole("gridcell", { name: "Batch, row 1", exact: true })
        .locator("span")
        .first();
      const clipping = await primaryText.evaluate((element) => ({
        overflow: getComputedStyle(element).overflow,
        display: getComputedStyle(element).display,
      }));
      if (clipping.display === "inline" || clipping.overflow !== "hidden")
        throw new Error("narrow primary text spills into system columns");
      if (!userCell || userCell.x < 124 || userCell.x + userCell.width > 391)
        throw new Error("system author is obscured on phone");
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      )
        throw new Error("page overflows phone viewport");
    } catch (error) {
      fails.push(String(error).split("\n")[0]);
    }
    const shot = "table-system-fields--phone-dark.png";
    await page.screenshot({ path: join(OUT, shot) });
    checks[shot] = { fails };
    console.log(
      `${fails.length ? "FAIL" : "ok  "} ${shot} ${fails.join("; ")}`,
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
  await page.goto(await freshGridUrl(), { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  try {
    await page.getByRole("button", { name: /^Filter/ }).click();
    await page.getByRole("button", { name: "Add filter" }).click();
    await page.waitForTimeout(500);
  } catch (e) {
    fails.push(
      `interaction failed: ${String(e).split("\n").slice(0, 3).join(" | ")}`,
    );
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
const fillNewRowForm = async (p) => {
  // Toolbar on desktop, under-grid entry point on phone.
  const entries = p.getByRole("button", { name: "New row", exact: true });
  await (p.viewportSize().width < 600
    ? entries.last()
    : entries.first()
  ).click();
  const title = p.getByRole("textbox", { name: "Batch", exact: true });
  await title.waitFor();
  if (!(await title.evaluate((el) => el === document.activeElement)))
    throw new Error("new-row form did not focus the first field");
  await title.fill("PB-NEW Form sample");
  await p
    .getByRole("group", { name: "Stage", exact: true })
    .getByRole("button")
    .click();
  await p.getByRole("option", { name: "Mixing", exact: true }).click();
  await p.getByRole("spinbutton", { name: "Cost", exact: true }).fill("12500");
};
const fillFieldEditor = async (p) => {
  await openFieldOptions(p);
  await p
    .getByRole("textbox", { name: "New field name", exact: true })
    .fill("Default delivery");
  await p.getByRole("textbox", { name: "Search field types" }).fill("date");
  const date = p.getByRole("button", { name: "Date", exact: true });
  await date.click();
  if ((await date.getAttribute("aria-pressed")) !== "true")
    throw new Error("Date was not selected");
  if ((await p.locator("button[data-field-type]").count()) !== 2)
    throw new Error("date search did not filter types");
  await p.locator('input[aria-label="Default value"]').fill("2026-11-17");
  await p
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Expected delivery date");
};
// CSV exercises real writes on its own table, never polluting existing render fixtures.
let csvRenderTable;
async function openCsvTable(p) {
  if (!csvRenderTable) {
    const response = await api.post(
      `${BASE}/api/data-table/organization/${org.id}`,
      { data: { name: "CSV import checks" } },
    );
    if (!response.ok()) throw new Error(await response.text());
    csvRenderTable = await response.json();
    for (const [name, type] of [
      ["Batch", "text"],
      ["Cost", "number"],
      ["Note", "longtext"],
    ]) {
      const field = await api.post(
        `${BASE}/api/data-table/organization/${org.id}/${csvRenderTable.id}/fields`,
        { data: { name, type } },
      );
      if (!field.ok()) throw new Error(await field.text());
    }
  }
  await p.goto(
    `${BASE}/dashboard/organization/${slug}/table/${csvRenderTable.id}`,
    { waitUntil: "networkidle" },
  );
}
async function csvPreviewState(p) {
  await openCsvTable(p);
  await p.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles({
    name: "batches.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      'Batch,Unrecognised,Cost,Legacy\r\n"CSV café 東京",ignored,not-a-number,excluded\r\n',
    ),
  });
  const dialog = p.getByRole("dialog");
  await dialog.getByText("CSV import preview", { exact: true }).waitFor();
  if (
    !(
      await dialog
        .getByRole("combobox", { name: "Map Unrecognised", exact: true })
        .innerText()
    ).includes("Exclude column")
  )
    throw new Error("Unknown column not excluded");
  await dialog
    .getByRole("button", { name: "Validate preview", exact: true })
    .click();
  await dialog.getByText(/Line 2 · Cost:/).waitFor();
  await dialog
    .getByText("Preview checked. No rows were created.", { exact: true })
    .waitFor();
  if (await dialog.getByText("0 rows created", { exact: true }).count())
    throw new Error("Preview repeats the zero-rows line");
  // Exclusion is reversible; the original positional column must stay put.
  await dialog
    .getByRole("combobox", { name: "Map Unrecognised", exact: true })
    .click();
  await p.getByRole("option", { name: "Note", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Validate preview", exact: true })
    .click();
  await dialog.getByText(/Line 2 · Cost:/).waitFor();
  if (!(await dialog.innerText()).includes("all-or-nothing"))
    throw new Error("Missing atomicity declaration");
  if (
    !(await dialog
      .getByRole("button", { name: "Import rows", exact: true })
      .isEnabled())
  )
    throw new Error("Cannot import validated batches");
}
async function csvCompletionState(p) {
  await openCsvTable(p);
  const prefix = `CSV-${Date.now()}`;
  const source = `Batch,Cost\n${Array.from({ length: 51 }, (_, i) => `${prefix}-${i},${i === 50 ? "invalid" : i}`).join("\n")}`;
  await p.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles({
    name: "batches.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(source),
  });
  const dialog = p.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Validate preview", exact: true })
    .click();
  await dialog.getByText(/Line 52 · Cost:/).waitFor();
  await dialog
    .getByRole("button", { name: "Import rows", exact: true })
    .click();
  await dialog.getByText("Import complete.", { exact: true }).waitFor();
  await dialog.getByText("50 rows created", { exact: true }).waitFor();
  const response = await p.request.post(
    `${BASE}/api/data-table/organization/${org.id}/${csvRenderTable.id}/row-query`,
    { data: { search: prefix } },
  );
  const persisted = await response.json();
  if (!response.ok() || persisted.total !== 50)
    throw new Error(
      `CSV completion disagrees with persisted rows: ${JSON.stringify(persisted)}`,
    );
}
async function csvCancelState(p) {
  await openCsvTable(p);
  const prefix = `CSV-CANCEL-${Date.now()}`;
  const source = `Batch,Cost\n${Array.from({ length: 101 }, (_, i) => `${prefix}-${i},${i}`).join("\n")}`;
  let release;
  let started;
  const secondStarted = new Promise((resolve) => {
    started = resolve;
  });
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await p.route("**/row-import", async (route) => {
    const body = route.request().postDataJSON();
    if (!body.preview && body.offset === 50) {
      started();
      await held;
    }
    await route.continue();
  });
  await p.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles({
    name: "cancel.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(source),
  });
  const dialog = p.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Validate preview", exact: true })
    .click();
  await dialog
    .getByText("Preview checked. No rows were created.", { exact: true })
    .waitFor();
  await dialog
    .getByRole("button", { name: "Import rows", exact: true })
    .click();
  await secondStarted;
  await dialog.getByText("50 rows created", { exact: true }).waitFor();
  await dialog
    .getByRole("button", { name: "Cancel after batch", exact: true })
    .click();
  release();
  await dialog
    .getByText("Cancelled. Completed batches were kept.", { exact: true })
    .waitFor();
  await dialog.getByText("100 rows created", { exact: true }).waitFor();
  await p.unroute("**/row-import");
  const response = await p.request.post(
    `${BASE}/api/data-table/organization/${org.id}/${csvRenderTable.id}/row-query`,
    { data: { search: prefix } },
  );
  if (!response.ok() || (await response.json()).total !== 100)
    throw new Error("Cancel summary disagrees with persisted batches");
}
const OVERLAY_STATES = [
  ...[
    ["desktop-dark", "dark", DESKTOP],
    ["phone-dark", "dark", { width: 390, height: 844 }],
  ].map(([suffix, theme, viewport]) => [
    `table-csv-cancel--${suffix}`,
    theme,
    viewport,
    csvCancelState,
    {
      ...GUTTER,
      footer_inset: 16,
      width: viewport.width === 390 ? 390 : 768,
      header_h: 44,
      footer_h: 52,
    },
  ]),
  ...[
    ["desktop-dark", "dark", DESKTOP],
    ["phone-dark", "dark", { width: 390, height: 844 }],
  ].map(([suffix, theme, viewport]) => [
    `table-csv-complete--${suffix}`,
    theme,
    viewport,
    csvCompletionState,
    {
      ...GUTTER,
      footer_inset: 16,
      width: viewport.width === 390 ? 390 : 768,
      header_h: 44,
      footer_h: 52,
    },
  ]),
  ...[
    ["desktop-dark", "dark", DESKTOP],
    ["desktop-light", "light", DESKTOP],
    ["phone-dark", "dark", { width: 390, height: 844 }],
  ].map(([suffix, theme, viewport]) => [
    `table-csv-preview--${suffix}`,
    theme,
    viewport,
    csvPreviewState,
    {
      ...GUTTER,
      footer_inset: 16,
      width: viewport.width === 390 ? 390 : 768,
      header_h: 44,
      footer_h: 52,
    },
  ]),
  ...[
    ["desktop-dark", "dark", DESKTOP],
    ["desktop-light", "light", DESKTOP],
    ["phone-dark", "dark", { width: 390, height: 844 }],
  ].map(([suffix, theme, viewport]) => [
    `table-link-settings--${suffix}`,
    theme,
    viewport,
    async (p) => {
      await openFieldOptions(p);
      await p
        .getByRole("textbox", { name: "New field name", exact: true })
        .fill("Customer relationship");
      await p.getByRole("textbox", { name: "Search field types" }).fill("link");
      await p
        .getByRole("button", { name: "Link to another table", exact: true })
        .click();
      await p
        .getByRole("combobox", { name: "Target table", exact: true })
        .click();
      await p.getByRole("option", { name: "Customer", exact: true }).click();
      await p.waitForTimeout(600);
      if (
        !(
          await p
            .getByRole("combobox", { name: "Target table", exact: true })
            .innerText()
        ).includes("Customer")
      )
        throw new Error(
          "Target table displays an opaque ID instead of Customer",
        );
      const choices = p.getByRole("radiogroup", {
        name: "Relationship",
        exact: true,
      });
      if ((await choices.getByRole("radio").count()) !== 4)
        throw new Error("Missing relationship cardinality");
      for (const sentence of [
        "belongs to one Customer",
        "has many Customer",
        "links to many Customer",
        "has at most one Customer",
      ])
        if (
          !(await choices
            .getByRole("radio", { name: new RegExp(sentence) })
            .count())
        )
          throw new Error(`Missing plain-language cardinality: ${sentence}`);
      if (
        (await choices
          .getByRole("radio")
          .first()
          .getAttribute("aria-checked")) !== "true"
      )
        throw new Error("Many-to-one is not the default");
      await p
        .getByRole("textbox", { name: "Reciprocal field name", exact: true })
        .fill("Invoices");
      if (!(await p.getByText(/Also creates “Invoices” on Customer/).count()))
        throw new Error("No reciprocal summary");
    },
    {
      ...GUTTER,
      footer_inset: 16,
      width: viewport.width === 390 ? 390 : 768,
      header_h: 44,
      footer_h: 52,
    },
  ]),
  ...[
    ["desktop-dark", "dark", DESKTOP],
    ["desktop-light", "light", DESKTOP],
    ["phone-dark", "dark", { width: 390, height: 844 }],
  ].map(([suffix, theme, viewport]) => [
    `dialog-field-editor--${suffix}`,
    theme,
    viewport,
    fillFieldEditor,
    {
      ...GUTTER,
      footer_inset: 16,
      width: viewport.width === 390 ? 390 : 768,
      header_h: 44,
      footer_h: 52,
    },
  ]),
  [
    "table-new-row-form--desktop-dark",
    "dark",
    DESKTOP,
    fillNewRowForm,
    { ...GUTTER, footer_inset: 16, width: 560, header_h: 44, footer_h: 52 },
  ],
  [
    "table-new-row-form--phone-dark",
    "dark",
    { width: 390, height: 844 },
    fillNewRowForm,
    { ...GUTTER, footer_inset: 16, width: 390, header_h: 44, footer_h: 52 },
  ],
  [
    "dialog-field-options--desktop-dark",
    "dark",
    DESKTOP,
    openFieldOptions,
    { ...GUTTER, footer_inset: 16, width: 768, header_h: 44, footer_h: 52 },
  ],
  [
    "dialog-field-options--desktop-light",
    "light",
    DESKTOP,
    openFieldOptions,
    { ...GUTTER, footer_inset: 16, width: 768, header_h: 44, footer_h: 52 },
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
      // Untouched default: half the 1440px viewport (a stored width would win).
      width: 720,
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
    await page.goto(await freshGridUrl(), { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    try {
      await open(page);
      await page.waitForTimeout(700);
      await page.mouse.move(2, 2);
    } catch (e) {
      fails.push(
        `interaction failed: ${String(e).split("\n").slice(0, 3).join(" | ")}`,
      );
    }
    if (name.startsWith("dialog-field-options")) {
      const search = page.getByRole("textbox", { name: "Search field types" });
      if (viewport.width < 768) await search.fill("json");
      await search.press("ArrowDown");
      await page.locator("button[data-field-type]:focus").press("End");
      const last = page.locator('button[data-field-type="json"]');
      if (!(await last.evaluate((el) => el === document.activeElement)))
        fails.push("type picker End did not reach JSON");
      const visible = await last.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const list = el
          .closest("details")
          .parentElement.getBoundingClientRect();
        return box.top >= list.top && box.bottom <= list.bottom;
      });
      if (!visible) fails.push("last type does not scroll into view");
      await search.fill("");
      await page
        .getByRole("textbox", { name: "New field name", exact: true })
        .focus();
      await page
        .locator('button[data-field-type="text"]')
        .evaluate((el) => el.scrollIntoView({ block: "nearest" }));
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
    if (name.startsWith("table-new-row-form")) {
      try {
        const layout = await page
          .locator('[data-slot="dialog-popup"]')
          .evaluate((popup) => {
            const bounds = popup.getBoundingClientRect();
            const footer = popup
              .querySelector('[data-slot="dialog-footer"]')
              .getBoundingClientRect();
            return {
              overflow: [
                ...popup.querySelectorAll(
                  'input, textarea, [role="group"], button',
                ),
              ].some(
                (el) => el.getBoundingClientRect().right > bounds.right + 1,
              ),
              footerVisible: footer.bottom <= innerHeight && footer.top >= 0,
            };
          });
        if (layout.overflow || !layout.footerVisible)
          throw new Error(`form layout ${JSON.stringify(layout)}`);
        const response = page.waitForResponse(
          (r) => r.request().method() === "POST" && r.url().endsWith("/rows"),
        );
        if (viewport.width > 600)
          await page
            .getByRole("spinbutton", { name: "Cost", exact: true })
            .press("Enter");
        else
          await page
            .getByRole("button", { name: "Create row", exact: true })
            .click();
        const added = await response;
        if (!added.ok())
          throw new Error(`create failed: ${await added.text()}`);
        const row = await added.json();
        const data = added.request().postDataJSON();
        if (
          !Object.values(data.values).includes(12500) ||
          !Object.values(data.values).includes("choice-mixing")
        )
          throw new Error("create did not send typed form values");
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        const cell = page
          .getByRole("gridcell")
          .filter({ hasText: "PB-NEW Form sample" });
        await cell.waitFor();
        const newRow = cell.locator("..");
        if (
          !(await newRow.innerText()).includes("Mixing") ||
          !(await newRow.innerText()).includes("12,500")
        )
          throw new Error("new row did not appear with form values");
        await page.screenshot({ path: join(OUT, `${name}-created.png`) });
        const removed = await page.request.delete(
          `${BASE}/api/data-table/organization/${org.id}/${tbl.id}/rows/${row.id}`,
        );
        if (!removed.ok())
          throw new Error("could not clean up form-created row");
      } catch (error) {
        fails.push(String(error));
      }
    }
    if (name.startsWith("dialog-field-editor")) {
      let fieldId;
      let rowId;
      const root = `${BASE}/api/data-table/organization/${org.id}/${tbl.id}`;
      try {
        const layout = await page
          .locator('[data-slot="dialog-popup"]')
          .evaluate((popup) => {
            const footer = popup
              .querySelector('[data-slot="dialog-footer"]')
              .getBoundingClientRect();
            return {
              overflow: popup.scrollWidth > popup.clientWidth,
              footerVisible: footer.bottom <= innerHeight && footer.top >= 0,
            };
          });
        if (layout.overflow || !layout.footerVisible)
          throw new Error(`field editor layout ${JSON.stringify(layout)}`);
        const saved = page.waitForResponse(
          (r) => r.request().method() === "POST" && r.url().endsWith("/fields"),
        );
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Add field", exact: true })
          .click();
        const fieldResponse = await saved;
        if (!fieldResponse.ok())
          throw new Error(`field create: ${await fieldResponse.text()}`);
        const field = await fieldResponse.json();
        fieldId = field.id;
        if (
          field.options.defaultValue !== "2026-11-17" ||
          field.options.description !== "Expected delivery date"
        )
          throw new Error("field options not stored");
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        const entries = page.getByRole("button", {
          name: "New row",
          exact: true,
        });
        await (viewport.width < 600 ? entries.last() : entries.first()).click();
        const input = page.locator('input[aria-label="Default delivery"]');
        if ((await input.inputValue()) !== "2026-11-17")
          throw new Error("new row did not prefill default");
        await page
          .getByRole("textbox", { name: "Batch", exact: true })
          .fill("Default row sample");
        await input.scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(OUT, `${name}-new-row.png`) });
        const created = page.waitForResponse(
          (r) => r.request().method() === "POST" && r.url().endsWith("/rows"),
        );
        await page
          .getByRole("button", { name: "Create row", exact: true })
          .click();
        const rowResponse = await created;
        if (!rowResponse.ok())
          throw new Error(`row create: ${await rowResponse.text()}`);
        const row = await rowResponse.json();
        rowId = row.id;
        if (row.values[fieldId] !== "2026-11-17")
          throw new Error("created row lost default");
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        const cell = page
          .getByRole("gridcell")
          .filter({ hasText: "Default row sample" });
        await cell.waitFor();
        await cell
          .locator("..")
          .getByRole("button", { name: /Expand row/ })
          .click();
        await page
          .getByText("Expected delivery date", { exact: true })
          .waitFor();
        await page.screenshot({ path: join(OUT, `${name}-created.png`) });
      } catch (error) {
        fails.push(String(error));
      } finally {
        if (rowId && !(await page.request.delete(`${root}/rows/${rowId}`)).ok())
          fails.push("could not remove default row");
        if (
          fieldId &&
          !(await page.request.delete(`${root}/fields/${fieldId}`)).ok()
        )
          fails.push("could not remove default field");
      }
    }
    checks[shot] = { fails, ...m };
    console.log(
      `${fails.length ? "FAIL" : "ok  "} ${shot} ${JSON.stringify(m)}${fails.length ? `\n      ${fails.join("\n      ")}` : ""}`,
    );
    await ctx.close();
  }
} else console.log("SKIP overlay states: the table page is not in PAGES");

// Search acceptance: real API, keyboard aliases, filter chips, snippets and safe highlighting.
if (pages.board) {
  for (const [tag, viewport] of [
    ["desktop", { width: 1440, height: 900 }],
    ["phone", { width: 390, height: 844 }],
  ]) {
    const ctx = await browser.newContext({
      viewport,
      storageState: state,
      colorScheme: "dark",
      reducedMotion: "reduce",
    });
    await ctx.addInitScript(() =>
      localStorage.setItem(
        "user-preferences",
        JSON.stringify({ state: { theme: "dark" }, version: 0 }),
      ),
    );
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(BASE + pages.board, { waitUntil: "networkidle" });
    const fails = [];
    if (tag === "desktop") {
      const hint = await page
        .locator("button")
        .filter({ hasText: /^Search/ })
        .first()
        .locator("kbd")
        .textContent();
      if (!/^(⌘K|Ctrl K)$/.test(hint ?? "") || hint === "/")
        fails.push(`sidebar search shortcut ${hint}`);
    }
    await page.keyboard.press("/");
    const popup = page.locator('[data-slot="command-dialog-popup"]');
    const input = popup.getByRole("combobox");
    await popup.waitFor();
    for (const [name, query] of [
      ["help", ""],
      ["autocomplete", "status:"],
      ["results", "housing pressure"],
      ["empty", "zzznomatch board:KFL"],
    ]) {
      await input.fill(query);
      if (name === "help") await page.getByTestId("search-help").waitFor();
      if (name === "autocomplete") {
        const chip = page.getByRole("button", {
          name: "status:in-progress",
          exact: true,
        });
        await chip.waitFor();
        await chip.click();
        if ((await input.inputValue()) !== "status:in-progress ")
          fails.push("filter chip did not complete the query");
        await input.fill("status:");
      }
      if (name === "results") {
        await popup
          .locator('[data-slot="command-item"]')
          .filter({ hasText: "Filter housing leak" })
          .first()
          .waitFor();
        if ((await popup.locator("mark").count()) < 2)
          fails.push("matched title/snippet not highlighted");
        if (
          !(
            await page.getByTestId("search-snippet").first().textContent()
          )?.includes("Pressure")
        )
          fails.push("description snippet missing");
      }
      if (name === "empty")
        await popup.getByText("Try fewer words or drop a filter.").waitFor();
      const overflow = await popup.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return [...element.querySelectorAll("input, button, code, mark")].some(
          (child) => child.getBoundingClientRect().right > bounds.right + 1,
        );
      });
      if (overflow) fails.push("search content overflows palette");
      const shot = `search-${name}--${tag}-dark.png`;
      await page.screenshot({ path: join(OUT, shot) });
      checks[shot] = { fails: [...fails, ...errors] };
      console.log(
        `${fails.length || errors.length ? "FAIL" : "ok  "} ${shot} ${fails.join("; ")}`,
      );
    }
    await page.keyboard.press("Escape");
    await popup.waitFor({ state: "hidden" });
    await page.keyboard.press(
      await page.evaluate(() =>
        navigator.platform.toLowerCase().includes("mac")
          ? "Meta+k"
          : "Control+k",
      ),
    );
    await popup.waitFor();
    await page.keyboard.press("Escape");
    await ctx.close();
  }
}

// Theme system acceptance: real account controls, persisted palettes and painted buttons.
for (const [preset, mode, tag, appearance] of [
  ["mono", "dark", "desktop", true],
  ["mono", "dark", "phone", true],
  ...["mono", "indigo", "slate", "graphite", "teal"].map((id) => [
    id,
    "dark",
    "desktop",
    false,
  ]),
  ["mono", "light", "desktop", false],
]) {
  const ctx = await browser.newContext({
    viewport:
      tag === "phone"
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
    storageState: state,
    colorScheme: mode,
    reducedMotion: "reduce",
  });
  await ctx.addInitScript(
    ({ preset, mode }) => {
      if (!localStorage.getItem("user-preferences"))
        localStorage.setItem(
          "user-preferences",
          JSON.stringify({
            state: { theme: mode, themePreset: preset, accentColor: null },
            version: 0,
          }),
        );
    },
    { preset, mode },
  );
  const page = await ctx.newPage();
  const fails = [];
  const measurements = [];
  page.on("pageerror", (e) => fails.push(String(e)));
  const shot = appearance
    ? `appearance--${tag}-${mode}.png`
    : `theme-${preset}--table-${mode}.png`;
  try {
    await page.goto(
      BASE +
        (appearance
          ? "/dashboard/settings/account/appearance"
          : `/dashboard/organization/${slug}/table/${tbl.id}`),
      { waitUntil: "networkidle" },
    );
    if (!appearance) await page.getByRole("grid").waitFor();
    const rootTheme = await page.locator("html").getAttribute("data-theme");
    if (rootTheme !== preset)
      throw new Error(`data-theme ${rootTheme}, expected ${preset}`);
    const palette = await page.evaluate(themeContrast);
    if (palette.buttonContrast < 4.5 || palette.mutedContrast < 4.5)
      throw new Error(`palette contrast ${JSON.stringify(palette)}`);
    if (appearance) {
      const cards = await page
        .locator('[data-testid^="preset-"]')
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const box = node.getBoundingClientRect();
            const sample = node
              .querySelector("[data-theme]")
              .getBoundingClientRect();
            return {
              top: box.top,
              bottom: box.bottom,
              left: box.left,
              right: box.right,
              sampleTop: sample.top,
              sampleBottom: sample.bottom,
            };
          }),
        );
      for (const c of cards)
        if (c.sampleTop < c.top || c.sampleBottom > c.bottom)
          throw new Error(`preview escapes card ${JSON.stringify(c)}`);
      for (let i = 0; i < cards.length; i++)
        for (let j = i + 1; j < cards.length; j++) {
          const a = cards[i];
          const b = cards[j];
          if (
            a.left < b.right &&
            b.left < a.right &&
            a.top < b.bottom &&
            b.top < a.bottom
          )
            throw new Error("preset cards overlap");
        }
    }
    if (appearance && tag === "phone") {
      const nav = page.locator("aside details");
      // Collapse the mobile settings navigation so the page is the captured surface.
      if ((await nav.count()) && (await nav.getAttribute("open")) !== null)
        await nav.locator("summary").click();
    }
    await page.screenshot({ path: join(OUT, shot), fullPage: appearance });
    if (appearance && tag === "phone") {
      await page
        .getByTestId("appearance-preview-action")
        .scrollIntoViewIfNeeded();
      const accentShot = "appearance-accent--phone-dark.png";
      await page.screenshot({ path: join(OUT, accentShot) });
      checks[accentShot] = { fails: [], preset, mode };
    }
    const assertButton = async () => {
      const button = appearance
        ? page.getByTestId("appearance-preview-action")
        : page.getByRole("button", { name: "New row", exact: true }).first();
      const measured = await button.evaluate((el) => {
        const s = getComputedStyle(el);
        const lum = (color) => {
          const channels = color
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number)
            .map((v) => {
              const c = v / 255;
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            });
          return channels.reduce(
            (n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i],
            0,
          );
        };
        const a = lum(s.color);
        const b = lum(s.backgroundColor);
        return {
          foreground: s.color,
          background: s.backgroundColor,
          ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        };
      });
      measurements.push(measured);
      if (!(measured.ratio >= 4.5))
        throw new Error(`painted button contrast ${JSON.stringify(measured)}`);
    };
    await assertButton();
    if (appearance) {
      await page.getByTestId("preset-teal").click();
      await page.waitForFunction(
        () => document.documentElement.dataset.theme === "teal",
      );
      await page.getByRole("button", { name: "#d97706", exact: true }).click();
      await assertButton();
      const hex = page.getByLabel("Custom hex colour");
      await hex.fill("#eeeeee");
      await assertButton();
      await page.reload({ waitUntil: "networkidle" });
      if ((await hex.inputValue()) !== "#eeeeee")
        throw new Error("accent did not survive reload");
      await hex.fill("#zzzzzz");
      if ((await hex.getAttribute("aria-invalid")) !== "true")
        throw new Error("invalid hex accepted");
      await page
        .getByRole("button", { name: "Reset to preset", exact: true })
        .click();
      if (
        (await page
          .locator("html")
          .evaluate((el) => el.style.getPropertyValue("--primary"))) !== ""
      )
        throw new Error("reset left inline accent");
      await page.getByRole("button", { name: "System", exact: true }).click();
      await page.emulateMedia({ colorScheme: "light" });
      await page.waitForFunction(() =>
        document.documentElement.classList.contains("light"),
      );
      await assertButton();
      await page.emulateMedia({ colorScheme: "dark" });
      await page.waitForFunction(() =>
        document.documentElement.classList.contains("dark"),
      );
      await page.getByTestId("preset-mono").click();
      const overflow = await page
        .getByTestId("appearance-settings")
        .evaluate((el) => {
          const right = el.getBoundingClientRect().right;
          return [...el.querySelectorAll("button,input,p,h1")]
            .filter((node) => node.getBoundingClientRect().right > right + 1)
            .map(
              (node) =>
                `${node.tagName.toLowerCase()}[class=${node.className}]`,
            );
        });
      if (overflow.length)
        throw new Error(`appearance overflow: ${overflow.join(",")}`);
    }
  } catch (e) {
    fails.push(String(e));
  }
  checks[shot] = { fails, preset, mode, measurements };
  console.log(
    `${fails.length ? "FAIL" : "ok  "} ${shot} ${JSON.stringify(checks[shot])}`,
  );
  await ctx.close();
}

await browser.close();
writeFileSync(join(OUT, "checks.json"), JSON.stringify(checks, null, 1));
const bad = Object.values(checks).reduce((n, c) => n + c.fails.length, 0);
console.log(`${Object.keys(checks).length} shots · ${bad} failures`);
process.exit(bad ? 1 : 0);
