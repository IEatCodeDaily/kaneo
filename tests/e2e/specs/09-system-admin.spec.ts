import { expect, loadFixtures, test } from "../helpers";

const fixture = loadFixtures();

test("system administration is separate, real, and failure-safe", async ({
  page,
  pageErrors,
}) => {
  const failedAdminDependencies: string[] = [];
  page.on("response", (response) => {
    const url = response.url();
    if (
      response.status() >= 500 &&
      (url.includes("/api/auth/organization/get-full-organization") ||
        url.includes("/api/oidc-team-sync") ||
        url.includes("/api/admin/"))
    ) {
      failedAdminDependencies.push(`${response.status()} ${url}`);
    }
  });

  const activeOrganization = await page.request.get(
    `${fixture.baseURL}/api/auth/organization/get-full-organization`,
  );
  expect(activeOrganization.ok()).toBeTruthy();

  await page.goto(`${fixture.baseURL}/dashboard/admin`);
  if (await page.getByText("System administration").first().isVisible()) {
    await expect(
      page.getByRole("heading", { name: "System administration" }),
    ).toBeVisible();
    for (const section of [
      "Overview",
      "Users",
      "Organizations",
      "GitHub App",
      "Authentication / OIDC",
      "Instance configuration",
    ]) {
      await expect(page.getByRole("tab", { name: section })).toBeVisible();
    }

    const statusResponse = await page.request.get(
      `${fixture.baseURL}/api/admin/status`,
    );
    expect(statusResponse.ok()).toBeTruthy();
    expect((await statusResponse.json()).counts.users).toBeGreaterThan(0);

    const organizationsResponse = await page.request.get(
      `${fixture.baseURL}/api/admin/organizations`,
    );
    expect(organizationsResponse.ok()).toBeTruthy();
    expect(await organizationsResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fixture.organizationId }),
      ]),
    );

    const oidcResponse = await page.request.get(
      `${fixture.baseURL}/api/oidc-team-sync`,
    );
    expect(oidcResponse.ok()).toBeTruthy();
    const oidc = await oidcResponse.json();
    expect(Array.isArray(oidc.configs)).toBeTruthy();
    expect(Array.isArray(oidc.teams)).toBeTruthy();

    const saveOidc = await page.request.put(
      `${fixture.baseURL}/api/oidc-team-sync`,
      {
        data: {
          organizationId: fixture.organizationId,
          claimPath: "realm_access.roles",
          roleMappings: [],
        },
      },
    );
    expect(saveOidc.ok()).toBeTruthy();
    expect(await saveOidc.json()).toEqual(
      expect.objectContaining({
        organizationId: fixture.organizationId,
        claimPath: "realm_access.roles",
      }),
    );

    const kaneoTeam = oidc.teams.find(
      (team: { organizationId: string; source: string }) =>
        team.organizationId === fixture.organizationId &&
        team.source === "kaneo",
    );
    if (kaneoTeam) {
      const rejected = await page.request.put(
        `${fixture.baseURL}/api/oidc-team-sync`,
        {
          data: {
            organizationId: fixture.organizationId,
            claimPath: "roles",
            roleMappings: [{ role: "developer", teamId: kaneoTeam.id }],
          },
        },
      );
      expect(rejected.status()).toBe(400);
    }

    await page.route("**/api/admin/status", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Simulated admin failure" }),
      });
    });
    await page.reload();
    await expect(
      page.getByText("Administration data unavailable"),
    ).toBeVisible();
    await expect(page.getByText("Simulated admin failure")).toBeVisible();
  } else {
    await expect(page).toHaveURL(/\/dashboard$/);
  }

  expect(failedAdminDependencies).toEqual([]);
  expect(pageErrors).toEqual([]);
});
