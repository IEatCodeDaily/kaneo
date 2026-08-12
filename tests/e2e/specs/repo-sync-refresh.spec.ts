import { expect, test } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

test("repo list refreshes automatically after resync (REPO_SYNCED push)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const wsMessages = [];
  page.on("websocket", (ws) => {
    ws.on("framereceived", (frame) => {
      try {
        const data = JSON.parse(frame.payload);
        wsMessages.push(data);
      } catch {}
    });
  });

  const repoRefetches = [];
  page.on("request", (request) => {
    const url = request.url();
    // List endpoint is /api/repo?organizationId=… (no trailing slash),
    // detail endpoints are /api/repo/<id>/…; match both.
    if (/\/api\/repo(\/|\?)/.test(url) && request.method() === "GET") {
      repoRefetches.push(url);
    }
  });

  await page.goto("https://kaneo.entelechia.cloud/dashboard", {
    waitUntil: "networkidle",
  });

  // Navigate to the repos index of the org.
  await page.goto(
    "https://kaneo.entelechia.cloud/dashboard/organization/nevrlabs/repo",
    { waitUntil: "networkidle" },
  );

  // Read the current "Last synced" cell of the first repo row.
  const rowCount = await page.locator("table tbody tr").count();
  console.log("repo rows:", rowCount);
  expect(rowCount).toBeGreaterThan(0);

  const lastSyncedBefore = await page
    .locator("table tbody tr")
    .first()
    .innerText();
  console.log("row before:", lastSyncedBefore.replace(/\n/g, " | "));

  // Open the row's action menu and click Resync (RefreshCw icon button).
  const firstRow = page.locator("table tbody tr").first();
  const buttons = firstRow.locator("button");
  const buttonCount = await buttons.count();
  console.log("row buttons:", buttonCount);
  let clicked = false;
  for (let i = 0; i < buttonCount; i++) {
    const html = await buttons.nth(i).innerHTML();
    if (html.includes("refresh") || html.includes("rotate")) {
      await buttons.nth(i).click();
      clicked = true;
      break;
    }
  }
  console.log("resync clicked:", clicked);
  expect(clicked).toBe(true);

  // Clear request log now: everything after this point is push-driven.
  repoRefetches.length = 0;

  // Wait for the REPO_SYNCED push (mirror of a small repo takes seconds).
  await expect
    .poll(
      () => wsMessages.filter((m) => m.type === "REPO_SYNCED").length,
      { timeout: 120_000, intervals: [1000] },
    )
    .toBeGreaterThan(0);
  console.log(
    "REPO_SYNCED messages:",
    JSON.stringify(wsMessages.filter((m) => m.type === "REPO_SYNCED")),
  );

  // The push must trigger automatic refetches of repo queries — no reload.
  await expect
    .poll(() => repoRefetches.length, { timeout: 15_000, intervals: [500] })
    .toBeGreaterThan(0);
  console.log("push-driven repo refetches:", repoRefetches.slice(0, 5));

  // And the Last synced cell should now render a fresh value.
  const lastSyncedAfter = await page
    .locator("table tbody tr")
    .first()
    .innerText();
  console.log("row after:", lastSyncedAfter.replace(/\n/g, " | "));
});
