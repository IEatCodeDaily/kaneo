import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

test("organization AI bubble enforces limits and returns a live response", async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoAndSettle(
    page,
    `/dashboard/organization/${fixtures.organizationId}`,
  );

  await page
    .getByRole("button", { name: "Open organization AI assistant" })
    .click();
  const panel = page.getByRole("region", {
    name: "Organization AI assistant",
  });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("0/2000");

  const input = page.getByRole("textbox", {
    name: "Message organization AI assistant",
  });
  await input.fill("Reply with a short greeting and take no actions.");
  await panel.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("ai-chat-history")).toContainText(
    /Hi|Hello|help/i,
    { timeout: 60_000 },
  );
  expect(pageErrors).toEqual([]);
});
