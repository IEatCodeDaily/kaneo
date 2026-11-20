import { describe, expect, it } from "vitest";
import {
  matchSidebarPattern,
  SIDEBAR_ACTIVE_PILL,
  SIDEBAR_ROUTES,
  sidebarEntryIsActive,
} from "../use-sidebar-active";

const ORG = { organizationSlug: "acme" };

describe("matchSidebarPattern", () => {
  it("binds $params from the pathname and matches literal segments", () => {
    expect(
      matchSidebarPattern(
        SIDEBAR_ROUTES.board,
        "/dashboard/organization/acme/board/delivery/board",
      ),
    ).toEqual({ organizationSlug: "acme", boardSlug: "delivery" });
  });

  it("matches by whole segments only — a substring slug is not a match", () => {
    // "api" inside "/rapid" must not bind: substring matching produced
    // phantom highlights in NavProjects before the central matcher.
    expect(
      matchSidebarPattern(
        SIDEBAR_ROUTES.repo,
        "/dashboard/organization/rapid/repo/api/code",
      ),
    ).toEqual({ organizationSlug: "rapid", repoId: "api" });
    expect(
      matchSidebarPattern(
        SIDEBAR_ROUTES.repo,
        "/dashboard/organization/rapid/other/repo/api/code",
      ),
    ).toBeNull();
  });

  it("is prefix-based by default and exact when asked", () => {
    const projects = "/dashboard/organization/acme/projects";
    expect(
      matchSidebarPattern(SIDEBAR_ROUTES.projects, `${projects}/launch`),
    ).not.toBeNull();
    expect(
      matchSidebarPattern(SIDEBAR_ROUTES.projects, `${projects}/launch`, {
        exact: true,
      }),
    ).toBeNull();
    expect(
      matchSidebarPattern(SIDEBAR_ROUTES.projects, projects, { exact: true }),
    ).toEqual({
      organizationSlug: "acme",
    });
  });

  it("does not let a section base swallow a longer sibling segment", () => {
    // /table must not match /tables (segment-wise, not string prefix).
    expect(
      matchSidebarPattern(
        SIDEBAR_ROUTES.tables,
        "/dashboard/organization/acme/tables/table-1",
      ),
    ).toBeNull();
  });
});

describe("sidebarEntryIsActive — route families", () => {
  it("board view: kanban, backlog, calendar, milestones and the gantt Timeline stay active on the board item", () => {
    for (const view of [
      "board",
      "backlog",
      "calendar",
      "milestones",
      "gantt",
    ]) {
      expect(
        sidebarEntryIsActive(
          SIDEBAR_ROUTES.board,
          `/dashboard/organization/acme/board/delivery/${view}`,
          { ...ORG, boardSlug: "delivery" },
        ),
        view,
      ).toBe(true);
    }
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.board,
        "/dashboard/organization/acme/board/delivery/task/PROJ-12",
        { ...ORG, boardSlug: "delivery" },
      ),
    ).toBe(true);
  });

  it("board view: another board or another org does not activate the item", () => {
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.board,
        "/dashboard/organization/acme/board/other/board",
        { ...ORG, boardSlug: "delivery" },
      ),
    ).toBe(false);
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.board,
        "/dashboard/organization/other/board/delivery/board",
        { ...ORG, boardSlug: "delivery" },
      ),
    ).toBe(false);
  });

  it("repo issues, pulls, code (and issue detail children) stay active on the repo item", () => {
    for (const path of [
      "/dashboard/organization/acme/repo/api-2/issues",
      "/dashboard/organization/acme/repo/api-2/pulls",
      "/dashboard/organization/acme/repo/api-2/code",
      "/dashboard/organization/acme/repo/api-2/issues/42",
      "/dashboard/organization/acme/repo/api-2/pulls/7",
    ]) {
      expect(
        sidebarEntryIsActive(SIDEBAR_ROUTES.repo, path, {
          ...ORG,
          repoId: "api-2",
        }),
        path,
      ).toBe(true);
    }
  });

  it("project view stays active on the project item across its child routes", () => {
    for (const path of [
      "/dashboard/organization/acme/projects/launch",
      "/dashboard/organization/acme/projects/launch/tickets",
      "/dashboard/organization/acme/projects/launch/updates",
    ]) {
      expect(
        sidebarEntryIsActive(SIDEBAR_ROUTES.project, path, {
          ...ORG,
          projectSlug: "launch",
        }),
        path,
      ).toBe(true);
    }
  });

  it("dashboards and tables activate by id params", () => {
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.dashboard,
        "/dashboard/organization/acme/dashboards/dash-1",
        { ...ORG, dashboardId: "dash-1" },
      ),
    ).toBe(true);
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.table,
        "/dashboard/organization/acme/table/tbl-1",
        { ...ORG, tableId: "tbl-1" },
      ),
    ).toBe(true);
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.table,
        "/dashboard/organization/acme/table/tbl-2",
        { ...ORG, tableId: "tbl-1" },
      ),
    ).toBe(false);
  });

  it("inbox and my-tasks activate with prefix semantics for child routes", () => {
    for (const path of [
      "/dashboard/organization/acme/inbox",
      "/dashboard/organization/acme/inbox/notifications",
      "/dashboard/organization/acme/my-tasks",
      "/dashboard/organization/acme/my-tasks/board",
    ]) {
      const inbox = path.includes("inbox");
      expect(sidebarEntryIsActive(SIDEBAR_ROUTES.inbox, path, ORG), path).toBe(
        inbox,
      );
      expect(
        sidebarEntryIsActive(SIDEBAR_ROUTES.myTasks, path, ORG),
        path,
      ).toBe(!inbox);
    }
  });

  it("home activates on its own route only, and the org index stays distinct", () => {
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.home,
        "/dashboard/organization/acme/home",
        ORG,
      ),
    ).toBe(true);
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.orgIndex,
        "/dashboard/organization/acme",
        ORG,
      ),
    ).toBe(true);
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.home,
        "/dashboard/organization/acme",
        ORG,
      ),
    ).toBe(false);
    // The org index pattern is a prefix of every org route, so it is only
    // ever consumed with exact:true (the collapsed-rail Boards overview).
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.orgIndex,
        "/dashboard/organization/acme",
        ORG,
        {
          exact: true,
        },
      ),
    ).toBe(true);
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.orgIndex,
        "/dashboard/organization/acme/home",
        ORG,
        {
          exact: true,
        },
      ),
    ).toBe(false);
  });

  it("section bases cover every child route for the fallback header", () => {
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.boards,
        "/dashboard/organization/acme/board/delivery/gantt",
        ORG,
      ),
    ).toBe(true);
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.repos,
        "/dashboard/organization/acme/repo/api-2/code",
        ORG,
      ),
    ).toBe(true);
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.projects,
        "/dashboard/organization/acme/projects/launch",
        ORG,
      ),
    ).toBe(true);
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.boards,
        "/dashboard/organization/acme/inbox",
        ORG,
      ),
    ).toBe(false);
  });

  it("fails closed when an expected param is not bound by the pattern", () => {
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.inbox,
        "/dashboard/organization/acme/inbox",
        { ...ORG, boardSlug: "x" },
      ),
    ).toBe(false);
  });
});

describe("pinned entries", () => {
  it("members matches the organization members page and its children", () => {
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.members,
        "/dashboard/organization/acme/members",
        ORG,
      ),
    ).toBe(true);
    // A sibling resource page does not leak in.
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.members,
        "/dashboard/organization/acme/home",
        ORG,
      ),
    ).toBe(false);
    // A different organization's members page fails the param expectation.
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.members,
        "/dashboard/organization/other/members",
        ORG,
      ),
    ).toBe(false);
  });

  it("settings matches the whole settings section, only there", () => {
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.settings,
        "/dashboard/settings/account/information",
      ),
    ).toBe(true);
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.settings,
        "/dashboard/settings/organization/members",
      ),
    ).toBe(true);
    expect(
      sidebarEntryIsActive(SIDEBAR_ROUTES.settings, "/dashboard/settings"),
    ).toBe(true);
    expect(
      sidebarEntryIsActive(
        SIDEBAR_ROUTES.settings,
        "/dashboard/organization/acme/home",
      ),
    ).toBe(false);
  });
});

describe("shared selected treatment", () => {
  it("is a single pill constant every depth reuses", () => {
    expect(SIDEBAR_ACTIVE_PILL).toBe(
      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-primary-soft data-[active=true]:font-semibold data-[active=true]:text-primary-soft-foreground",
    );
  });
});
