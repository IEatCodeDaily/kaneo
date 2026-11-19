import { describe, expect, it } from "vitest";
import { resolveRecentPage } from "./recent-page";

const organization = { id: "org-uuid", slug: "acme" };

const resources = {
  boards: [{ id: "board-uuid", slug: "delivery", name: "Delivery" }],
  repos: [{ id: "repo-uuid", name: "kaneo" }],
  projects: [{ id: "project-uuid", slug: "launch", name: "Launch" }],
  dashboards: [{ id: "dash-uuid", name: "Ops overview" }],
  tables: [{ id: "table-uuid", name: "Shipments" }],
};

describe("resolveRecentPage", () => {
  it("canonicalizes board UUID routes and uses the board name", () => {
    expect(
      resolveRecentPage(
        "/dashboard/organization/org-uuid/board/board-uuid/backlog",
        organization,
        resources,
      ),
    ).toEqual({
      pathname: "/dashboard/organization/acme/board/delivery/backlog",
      label: "Delivery",
      kind: "board",
    });
  });

  it("uses the repo name instead of its active view label", () => {
    expect(
      resolveRecentPage(
        "/dashboard/organization/org-uuid/repo/repo-uuid/issues",
        organization,
        resources,
      ),
    ).toEqual({
      pathname: "/dashboard/organization/acme/repo/repo-uuid/issues",
      label: "kaneo",
      kind: "repo",
    });
  });

  it("canonicalizes project UUID routes and uses the project name", () => {
    expect(
      resolveRecentPage(
        "/dashboard/organization/org-uuid/projects/project-uuid/tickets",
        organization,
        resources,
      ),
    ).toEqual({
      pathname: "/dashboard/organization/acme/projects/launch/tickets",
      label: "Launch",
      kind: "project",
    });
  });

  it("remembers dashboard pages under their name", () => {
    expect(
      resolveRecentPage(
        "/dashboard/organization/org-uuid/dashboards/dash-uuid",
        organization,
        resources,
      ),
    ).toEqual({
      pathname: "/dashboard/organization/acme/dashboards/dash-uuid",
      label: "Ops overview",
      kind: "dashboard",
    });
  });

  it("remembers table pages under their name", () => {
    expect(
      resolveRecentPage(
        "/dashboard/organization/org-uuid/table/table-uuid",
        organization,
        resources,
      ),
    ).toEqual({
      pathname: "/dashboard/organization/acme/table/table-uuid",
      label: "Shipments",
      kind: "table",
    });
  });

  it("does not remember unresolved or overview routes", () => {
    expect(
      resolveRecentPage(
        "/dashboard/organization/acme/board/missing/board",
        organization,
        resources,
      ),
    ).toBeNull();
    expect(
      resolveRecentPage(
        "/dashboard/organization/acme/projects",
        organization,
        resources,
      ),
    ).toBeNull();
  });
});
