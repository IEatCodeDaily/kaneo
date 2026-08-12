import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

// 1x1 transparent PNG — the bytes do not matter, only that the editor inserts
// and lays out a real image node.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

/**
 * Pasting an image used to fill the create-task modal body, leaving the user no
 * visible place to type a description.
 */
test("pasting an image into a new task leaves room to type a description", async ({
  page,
  pageErrors,
}) => {
  test.skip(!fixtures.boardId, "no board available");

  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoAndSettle(
    page,
    `/dashboard/organization/${fixtures.organizationId}/board/${fixtures.boardId}`,
  );

  // Never inherit a draft from an earlier run.
  await page.evaluate(() => window.localStorage.removeItem("task-drafts"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});

  const dialog = page.getByRole("dialog");
  if (!(await dialog.count())) {
    await page.getByTitle("Add task").first().click();
  }
  await expect(dialog.first()).toBeVisible({ timeout: 10_000 });

  const modal = page.locator(".kaneo-create-task-modal");
  await expect(modal).toBeVisible();

  const editor = modal.locator(".kaneo-comment-editor-content .ProseMirror");
  await editor.click();
  await page.keyboard.type("Before image");

  // Paste a real image through the clipboard, the way a user would.
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "pasted.png", { type: "image/png" }));
    const target = document.querySelector(
      ".kaneo-create-task-modal .kaneo-comment-editor-content .ProseMirror",
    );
    target?.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }),
    );
  }, PNG_BASE64);

  const image = editor.locator("img.kaneo-editor-image").first();
  await expect(image).toBeVisible({ timeout: 20_000 });

  const viewport = page.viewportSize();
  const imageBox = await image.boundingBox();
  if (!viewport || !imageBox)
    throw new Error("Missing viewport or image bounding box");

  // The image is capped so it cannot swallow the editor body (32vh rule).
  expect(imageBox.height).toBeLessThan(viewport.height * 0.4);

  // The user must still be able to type after the image, and that text has to
  // land in the document.
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("After image");
  await expect(editor).toContainText("After image");

  // The typing line must remain on screen rather than pushed below the modal —
  // that is the reported symptom.
  const lastLine = editor.locator("p").last();
  const lastBox = await lastLine.boundingBox();
  if (!lastBox) throw new Error("Missing last paragraph bounding box");
  expect(lastBox.height).toBeGreaterThan(0);
  expect(lastBox.y).toBeLessThan(viewport.height);

  // Clean up so the next run starts from a blank form.
  await modal.getByRole("button", { name: "Discard draft" }).click();

  expect(pageErrors).toEqual([]);
});
