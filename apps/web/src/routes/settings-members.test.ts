import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * KFL-378 follow-up: the sidebar redesign moved Members "under Settings",
 * but no members page was ever created under settings/organization — so the
 * old entry point was removed and the destination never existed.
 *
 * These bind to the shipped artifact: the settings nav definition and the
 * route file that must back it.
 */

const web = (p: string) => path.resolve(process.cwd(), p);

describe("organization settings members entry", () => {
  it("registers Members in the organization settings nav", async () => {
    const source = await readFile(
      web(
        "src/routes/_layout/_authenticated/dashboard/settings/organization.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("/dashboard/settings/organization/members");
  });

  it("ships a route file backing that nav entry", async () => {
    // route-registration-and-reachability: a nav item pointing at a route
    // that does not exist is a 404, not a feature.
    const route = await readFile(
      web(
        "src/routes/_layout/_authenticated/dashboard/settings/organization/members.tsx",
      ),
      "utf8",
    );
    expect(route).toContain(
      "/_layout/_authenticated/dashboard/settings/organization/members",
    );
    // reuse, don't rebuild: the members list already exists as a component
    expect(route).toContain("OrganizationMembersGroups");
  });

  it("has the route wired into the generated route tree", async () => {
    const tree = await readFile(web("src/routeTree.gen.ts"), "utf8");
    expect(tree).toContain("settings/organization/members");
  });
});
