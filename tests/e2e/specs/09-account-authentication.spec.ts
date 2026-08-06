import { expect, gotoAndSettle, test } from "../helpers";

test("account authentication shows linked IdPs and separate GitHub delegation", async ({
  page,
  pageErrors,
}) => {
  await gotoAndSettle(page, "/dashboard/settings/account/authentication");

  await expect(
    page.getByRole("heading", { name: "Authentication" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sign-in methods" }),
  ).toBeVisible();
  await expect(page.getByText("ZITADEL", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your GitHub account" }),
  ).toBeVisible();
  await expect(
    page.getByText(/separate and is never used to sign you in/i),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("legacy account connection routes redirect to Authentication", async ({
  page,
}) => {
  await gotoAndSettle(page, "/dashboard/settings/account/connections");
  await expect(page).toHaveURL(
    /\/dashboard\/settings\/account\/authentication$/,
  );

  await gotoAndSettle(page, "/dashboard/settings/account/github");
  await expect(page).toHaveURL(
    /\/dashboard\/settings\/account\/authentication$/,
  );
});
