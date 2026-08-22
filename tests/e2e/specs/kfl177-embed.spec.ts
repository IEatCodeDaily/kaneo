import { test } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

const BASE = "https://kaneo.entelechia.cloud";

/** KFL-177 live proof: the embed view renders the public ticket fields. */
test("embed page renders ticket", async ({ browser }) => {
  // Fresh context WITHOUT the app's storage: embeds are unauthenticated.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const taskId = process.env.EMBED_TASK_ID;
  await page.goto(`${BASE}/embed.html?id=${taskId}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1500);

  console.log("KEY :", await page.locator("#ticketKey").innerText());
  console.log("ORG :", await page.locator("#organizationName").innerText());
  console.log("TITLE:", (await page.locator("#title").innerText()).trim());

  await page.screenshot({ path: "/tmp/kfl177-embed.png" });
  await ctx.close();
});
