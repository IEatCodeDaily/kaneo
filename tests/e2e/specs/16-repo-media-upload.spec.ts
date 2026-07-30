import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();
const repoId = "qkwllrmt4h95iarsjydx6o5g";
const issueNumber = 26;

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("repo description editor uploads media and inserts an absolute asset URL", async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoAndSettle(
    page,
    `/dashboard/organization/${fixtures.organizationId}/repo/${repoId}/issues/${issueNumber}`,
  );

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toBeVisible();

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles({
    name: "github-media-proof.png",
    mimeType: "image/png",
    buffer: tinyPng,
  });

  const image = editor.locator("img");
  await expect(image).toHaveCount(1, { timeout: 20_000 });
  const src = await image.getAttribute("src");
  expect(src).toMatch(
    /^https:\/\/kaneo\.entelechia\.cloud\/api\/asset\/[a-z0-9]+$/,
  );

  const response = await page.request.get(src as string);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
  expect(pageErrors).toEqual([]);
});
