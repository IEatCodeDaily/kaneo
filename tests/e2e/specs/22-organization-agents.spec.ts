import { expect, gotoAndSettle, test } from "../helpers";

test("AI agents are managed from organization settings", async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoAndSettle(page, "/dashboard/settings/organization/general");

  // Discoverability is the point: this shipped under Account → Developer first,
  // where organization admins could not find it.
  const agentsNav = page.getByRole("link", { name: "AI agents" });
  await expect(agentsNav).toBeVisible();
  await agentsNav.click();

  await expect(
    page.getByRole("heading", { level: 1, name: "AI agents" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Agent name" })).toBeVisible();
  // Expiry is mandatory, so Create stays disabled until both fields are set.
  const create = page.getByRole("button", { name: "Create" });
  await expect(create).toBeDisabled();
  await page.getByRole("textbox", { name: "Agent name" }).fill("Probe agent");
  await expect(create).toBeDisabled();

  expect(pageErrors).toEqual([]);
});
