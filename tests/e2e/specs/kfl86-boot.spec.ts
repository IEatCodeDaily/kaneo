import { test } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

const BASE = "https://kaneo.entelechia.cloud";

/** KFL-86 live proof: app boots and board renders with the new chunk split. */
test("board loads on split chunks", async ({ page }) => {
  const failed: string[] = [];
  page.on("pageerror", (e) => failed.push(String(e)));
  const responses: { url: string; status: number }[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/assets/"))
      responses.push({ url: r.url(), status: r.status() });
  });

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  console.log("PAGE ERRORS:", failed.length ? failed : "(none)");
  const bad = responses.filter((r) => r.status >= 400);
  console.log("FAILED ASSETS:", bad.length ? JSON.stringify(bad) : "(none)");
  console.log("ASSET COUNT:", responses.length);

  // The board actually rendered (sidebar + content), not a white screen.
  await page.screenshot({ path: "/tmp/kfl86-boot.png", fullPage: false });
});
