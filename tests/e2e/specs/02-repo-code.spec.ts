import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

test.describe("repo code browser", () => {
  test.skip(!fixtures.repoId, "no repo fixture available");

  const codeUrl = () =>
    `/dashboard/organization/${fixtures.organizationId}/repo/${fixtures.repoId}/code`;

  test("preloads one recursive tree and expands nested folders locally", async ({
    page,
    pageErrors,
  }) => {
    const metadataRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (/\/api\/repo\/[^/]+\/(tree|contents)(?:\?|$)/.test(url)) {
        metadataRequests.push(url);
      }
    });
    await gotoAndSettle(page, codeUrl());

    const explorer = page.getByLabel("File explorer");
    await expect(explorer).toBeVisible();
    const entries = explorer.locator("button");
    await expect(entries.first()).toBeVisible();
    const rootCount = await entries.count();
    expect(rootCount).toBeGreaterThan(0);
    expect(
      metadataRequests.filter((url) => /\/tree(?:\?|$)/.test(url)),
    ).toHaveLength(1);
    expect(
      metadataRequests.filter((url) => /\/contents(?:\?|$)/.test(url)),
    ).toHaveLength(0);

    const folder = explorer
      .getByRole("button", { name: /^src$|^docs$/ })
      .first();
    test.skip(!(await folder.count()), "fixture repo has no nested directory");
    await folder.click();
    await expect
      .poll(async () => explorer.locator("button").count(), { timeout: 15_000 })
      .toBeGreaterThan(rootCount);

    const nestedFolder = explorer
      .getByRole("button", { name: "components" })
      .first();
    if (await nestedFolder.count()) await nestedFolder.click();
    await page.waitForTimeout(250);

    expect(
      metadataRequests.filter((url) => /\/tree(?:\?|$)/.test(url)),
    ).toHaveLength(1);
    expect(
      metadataRequests.filter((url) => /\/contents(?:\?|$)/.test(url)),
    ).toHaveLength(0);
    expect(pageErrors).toEqual([]);
  });

  test("mobile file selection replaces the tree and provides Back to files", async ({
    page,
    pageErrors,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoAndSettle(page, codeUrl());
    const explorer = page.getByLabel("File explorer");
    await expect(explorer).toBeVisible();

    const file = explorer
      .getByRole("button", { name: /\.(md|json|ts|tsx)$/ })
      .first();
    test.skip(!(await file.count()), "no text file in fixture root");
    await file.click();

    await expect(page.getByLabel("File viewer")).toBeVisible();
    await expect(explorer).toBeHidden();
    const back = page.getByRole("button", { name: "Back to files" });
    await expect(back).toBeVisible();
    await back.click();
    await expect(explorer).toBeVisible();
    await expect(page.getByLabel("File viewer")).toBeHidden();
    expect(pageErrors).toEqual([]);
  });

  test("opens a file with syntax highlighting and keeps the tree mounted", async ({
    page,
    pageErrors,
  }) => {
    await gotoAndSettle(page, codeUrl());
    const explorer = page.getByLabel("File explorer");

    // Drill into src/ then pick a source file.
    const srcFolder = explorer.getByRole("button", { name: "src" }).first();
    test.skip(!(await srcFolder.count()), "fixture repo has no src directory");
    await srcFolder.click();

    const componentsFolder = explorer
      .getByRole("button", { name: "components" })
      .first();
    if (await componentsFolder.count()) await componentsFolder.click();

    const file = explorer
      .getByRole("button", { name: /\.(tsx|ts|json|md)$/ })
      .first();
    await expect(file).toBeVisible();
    const fileName = (await file.innerText()).trim();
    await file.click();

    // Detail pane shows the file, and Shiki produced highlighted markup.
    await expect(
      page.getByText(fileName, { exact: false }).first(),
    ).toBeVisible();
    await expect(page.locator("pre").first()).toBeVisible({ timeout: 20_000 });

    // The explorer stays mounted: selecting a file must not remount the tree.
    await expect(explorer).toBeVisible();
    await expect(explorer.getByRole("button", { name: "src" })).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test("markdown files offer a source/preview toggle", async ({
    page,
    pageErrors,
  }) => {
    await gotoAndSettle(page, codeUrl());
    const explorer = page.getByLabel("File explorer");

    const readme = explorer
      .getByRole("button", { name: /README\.md/i })
      .first();
    test.skip(!(await readme.count()), "fixture repo has no root README.md");
    await readme.click();

    const sourceButton = page.getByRole("button", { name: "Source" });
    const previewButton = page.getByRole("button", { name: "Preview" });
    await expect(sourceButton).toBeVisible({ timeout: 20_000 });
    await expect(previewButton).toBeVisible();

    // Source shows raw markdown in a <pre>; preview renders HTML instead.
    await expect(page.locator("pre").first()).toBeVisible();
    await previewButton.click();
    await expect(page.locator(".prose").first()).toBeVisible();
    await sourceButton.click();
    await expect(page.locator("pre").first()).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test("code surface inherits the app background", async ({ page }) => {
    await gotoAndSettle(page, codeUrl());
    const explorer = page.getByLabel("File explorer");
    const file = explorer
      .getByRole("button", { name: /\.(md|json|ts|tsx)$/ })
      .first();
    test.skip(!(await file.count()), "no text file in fixture root");
    await file.click();

    const pre = page.locator("pre").first();
    await expect(pre).toBeVisible({ timeout: 20_000 });
    // Shiki's inlined theme background is stripped; the element must be
    // transparent so it blends with the card surface.
    //
    // Shiki swaps the plain <pre> for highlighted markup after first paint, so
    // a single read can land on the detached node and return "". Poll until the
    // element settles rather than sampling once.
    await expect
      .poll(
        async () =>
          await page
            .locator("pre")
            .first()
            .evaluate((node) => getComputedStyle(node).backgroundColor)
            .catch(() => ""),
        { timeout: 20_000 },
      )
      .toMatch(/rgba\(0,\s*0,\s*0,\s*0\)|transparent/);
  });
});
