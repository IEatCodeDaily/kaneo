import { expect, loadFixtures, test } from "../helpers";

const fixture = loadFixtures();

test("teams, resource grants, and admin guard are wired", async ({
  page,
  pageErrors,
}) => {
  await page.goto(`${fixture.baseURL}/dashboard/settings/organization/teams`);
  await expect(page).toHaveURL(
    new RegExp(
      `/dashboard/organization/${fixture.organizationId}/members\\?tab=teams`,
    ),
  );
  const peopleTabs = page.getByRole("tablist", {
    name: "Organization people",
  });
  const appHeader = page.locator("header").first();
  await expect(peopleTabs).toBeVisible();
  await expect(appHeader).toContainText("Members");
  const headerGeometry = await appHeader.evaluate((header) => {
    const breadcrumb = header.querySelector("nav");
    const tabs = header.querySelector('[role="tablist"]');
    if (
      !(breadcrumb instanceof HTMLElement) ||
      !(tabs instanceof HTMLElement)
    ) {
      return null;
    }
    const breadcrumbRect = breadcrumb.getBoundingClientRect();
    const tabsRect = tabs.getBoundingClientRect();
    return {
      sameRow: Math.abs(breadcrumbRect.top - tabsRect.top) < 8,
      tabsAfterBreadcrumb: tabsRect.left >= breadcrumbRect.left,
    };
  });
  expect(headerGeometry).toEqual({
    sameRow: true,
    tabsAfterBreadcrumb: true,
  });
  await expect(page.getByRole("tab", { name: "Teams" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("button", { name: "New team" })).toBeVisible();
  await expect(page.getByText(/Group members of .* into teams\./)).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "New team" }).click();
  const teamDialog = page.getByRole("dialog", { name: "Create team" });
  const teamName = teamDialog.getByLabel("Name");
  await expect(teamDialog).toBeVisible();
  const dialogInsets = await teamDialog.evaluate((dialog) => {
    const input = dialog.querySelector("input");
    if (!(input instanceof HTMLElement)) return null;
    const dialogRect = dialog.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    return {
      left: Math.round(inputRect.left - dialogRect.left),
      right: Math.round(dialogRect.right - inputRect.right),
    };
  });
  expect(dialogInsets?.left).toBeGreaterThanOrEqual(20);
  expect(dialogInsets?.right).toBeGreaterThanOrEqual(20);
  await expect(teamName).toBeFocused();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Invite member" })).toHaveCount(
    0,
  );

  await page.getByRole("tab", { name: "Members" }).click();
  await expect(
    page.getByRole("button", { name: "Invite member" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "New team" })).toHaveCount(0);

  const organization = { id: fixture.organizationId };

  const boardsResponse = await page.request.get(
    `${fixture.baseURL}/api/board?organizationId=${organization.id}`,
  );
  expect(boardsResponse.ok()).toBeTruthy();
  const boards = await boardsResponse.json();
  expect(boards.length).toBeGreaterThan(0);

  const membersResponse = await page.request.get(
    `${fixture.baseURL}/api/auth/organization/list-members?organizationId=${organization.id}`,
  );
  expect(membersResponse.ok()).toBeTruthy();
  const membersPayload = await membersResponse.json();
  const member = membersPayload.members?.[0];
  expect(member?.userId).toBeTruthy();

  const path = `${fixture.baseURL}/api/resource-grant/${organization.id}/board/${boards[0].id}`;
  const before = await page.request.get(path);
  const beforeBody = await before.json();
  expect(
    before.ok(),
    `${before.status()} ${JSON.stringify(beforeBody)}`,
  ).toBeTruthy();
  for (const existingGrant of beforeBody) {
    const cleanup = await page.request.delete(`${path}/${existingGrant.id}`);
    expect(cleanup.ok()).toBeTruthy();
  }

  const create = await page.request.put(path, {
    data: {
      principalType: "user",
      principalId: member.userId,
      privilege: "view",
    },
  });
  expect(create.ok()).toBeTruthy();
  const grant = await create.json();
  expect(grant.privilege).toBe("view");

  const after = await page.request.get(path);
  expect(after.ok()).toBeTruthy();
  expect(await after.json()).toHaveLength(1);

  await page.goto(
    `${fixture.baseURL}/dashboard/settings/boards/${boards[0].id}/visibility`,
  );
  await expect(page.getByText("Organization access")).toBeVisible();
  await expect(page.getByText("Member", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Select member", { exact: true })).toBeVisible();
  await expect(page.getByText("View", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(member.userId, { exact: true })).toHaveCount(0);

  const memberSelector = page.getByRole("combobox", { name: "Select member" });
  await memberSelector.click();
  const memberSearch = page.getByLabel("Search members");
  const selectorPopup = page.getByRole("dialog").filter({
    has: memberSearch,
  });
  await expect(memberSearch).toBeVisible();
  await expect(memberSearch).toBeFocused();
  const triggerRect = await memberSelector.boundingBox();
  const popupRect = await selectorPopup.boundingBox();
  expect(triggerRect).not.toBeNull();
  expect(popupRect).not.toBeNull();
  expect(
    Math.abs((triggerRect?.x ?? 0) - (popupRect?.x ?? 0)),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs((triggerRect?.width ?? 0) - (popupRect?.width ?? 0)),
  ).toBeLessThanOrEqual(2);
  const verticalGap = Math.min(
    Math.abs(
      (popupRect?.y ?? 0) + (popupRect?.height ?? 0) - (triggerRect?.y ?? 0),
    ),
    Math.abs(
      (triggerRect?.y ?? 0) + (triggerRect?.height ?? 0) - (popupRect?.y ?? 0),
    ),
  );
  expect(verticalGap).toBeLessThanOrEqual(4);
  await memberSearch.fill("definitely-no-such-member");
  await expect(page.getByText("No matching members.")).toBeVisible();
  await memberSearch.fill(member.user.name || member.user.email);
  await expect(
    page.getByRole("option", {
      name: new RegExp(member.user.name || member.user.email, "i"),
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByTestId("principal-type").click();
  await page.getByRole("option", { name: "Team", exact: true }).click();
  await page.getByText("Select team", { exact: true }).click();
  await expect(page.getByLabel("Search teams")).toBeVisible();
  await page.keyboard.press("Escape");

  const remove = await page.request.delete(`${path}/${grant.id}`);
  expect(remove.ok()).toBeTruthy();

  expect(pageErrors).toEqual([]);
});
