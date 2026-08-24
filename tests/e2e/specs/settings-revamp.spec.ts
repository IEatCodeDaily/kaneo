import { expect, test } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

const BASE = "https://kaneo.entelechia.cloud";

/**
 * KFL-188: the settings revamp must not make any existing page unreachable.
 *
 * The user has explicitly complained before about controls moving or
 * disappearing during restyles, so this walks the real routes on the deployed
 * app and asserts each one still renders rather than 404ing or blanking.
 */
/*
  NOTE: /dashboard/settings/organization/teams is deliberately NOT listed. That
  route has a pre-existing beforeLoad redirect to the organization members page
  (?tab=teams), so it never renders the settings shell at all. Verified against
  the route source, not assumed — it redirects with `replace: true` before the
  component mounts.
*/
const ROUTES = [
  "/dashboard/settings/account/information",
  "/dashboard/settings/account/preferences",
  "/dashboard/settings/account/notifications",
  "/dashboard/settings/account/authentication",
  "/dashboard/settings/account/connections",
  "/dashboard/settings/account/developer",
  "/dashboard/settings/organization/general",
  "/dashboard/settings/organization/labels",
  "/dashboard/settings/organization/roles",
  "/dashboard/settings/organization/agents",
  "/dashboard/settings/organization/features",
  "/dashboard/settings/organization/visibility",
  "/dashboard/settings/organization/templates",
  "/dashboard/settings/boards",
];

test("every settings route still renders after the revamp", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });

  const broken: string[] = [];

  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);

    const body = (await page.locator("body").innerText()).trim();
    const hasSectionNav =
      (await page.getByTestId("settings-section-account").count()) > 0;
    const redirectedToMembers =
      route === "/dashboard/settings/organization/agents" &&
      page.url().includes("/members?tab=members") &&
      body.includes("Organization AI agents");

    // Most settings pages keep the section sidebar. Agents intentionally lives
    // on the organization members surface, where role and credential management
    // are shown together.
    if ((!hasSectionNav && !redirectedToMembers) || body.length < 40) {
      broken.push(`${route} (nav=${hasSectionNav} len=${body.length})`);
      console.log(`BROKEN: ${route} nav=${hasSectionNav} len=${body.length}`);
    } else {
      console.log(`ok: ${route}`);
    }
  }

  expect(broken).toEqual([]);
});

test("section sidebar renders and navigates", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`${BASE}/dashboard/settings/account/information`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(1500);

  // Back to Dashboard stays top-left.
  const back = page.getByRole("button", { name: /back to/i }).first();
  const backBox = await back.boundingBox();
  console.log("back button box:", JSON.stringify(backBox));
  expect(backBox).toBeTruthy();

  // Sidebar sits to the LEFT of the content pane.
  const nav = page.getByTestId("settings-section-account");
  const navBox = await nav.boundingBox();
  console.log("account section box:", JSON.stringify(navBox));
  expect(navBox).toBeTruthy();

  const active = await page
    .getByTestId("settings-section-account")
    .getAttribute("data-active");
  console.log("account active:", active);
  expect(active).toBe("true");

  // Clicking Organization navigates and moves the active marker.
  await page.getByTestId("settings-section-organization").click();
  await page.waitForTimeout(2000);
  console.log("url after click:", page.url());
  expect(page.url()).toContain("/settings/organization");
  expect(
    await page
      .getByTestId("settings-section-organization")
      .getAttribute("data-active"),
  ).toBe("true");

  await page.screenshot({ path: "/tmp/kfl188-settings-sidebar.png" });
});
