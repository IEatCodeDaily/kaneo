import { expect, test } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

const BASE = "https://kaneo.entelechia.cloud";

/**
 * Repos settings must carry the same org identity block as boards settings.
 * Asserted on the deployed app because the complaint was visual: the two
 * panes read as different products.
 */
test("boards and repos settings both show the org header", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });

  await page.goto(`${BASE}/dashboard/settings/boards`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(2000);
  const boardsHeader = await page.getByTestId("settings-org-header").count();
  const boardsName = await page
    .getByTestId("settings-org-header")
    .innerText()
    .catch(() => "");
  console.log(`boards org header count=${boardsHeader} text=${boardsName.replace(/\n/g, " | ")}`);
  await page.screenshot({ path: "/tmp/kfl188-boards-settings.png" });

  await page.goto(`${BASE}/dashboard/settings/repos`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(2500);
  const reposHeader = await page.getByTestId("settings-org-header").count();
  const reposName = await page
    .getByTestId("settings-org-header")
    .innerText()
    .catch(() => "");
  console.log(`repos org header count=${reposHeader} text=${reposName.replace(/\n/g, " | ")}`);
  await page.screenshot({ path: "/tmp/kfl188-repos-settings.png" });

  expect(boardsHeader).toBe(1);
  expect(reposHeader).toBe(1);
  // Same organization identity on both panes.
  expect(reposName.trim()).toBe(boardsName.trim());
});
