import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  boardTable,
  dataTableTable,
  projectBoardTable,
  projectRepoTable,
  projectTableLinkTable,
  repoTable,
} from "../../database/schema";

const mocks = vi.hoisted(() => ({
  listAccessibleResourceIds: vi.fn(),
  listProjects: vi.fn(),
  select: vi.fn(),
}));

vi.mock("../../database", () => ({
  default: { select: mocks.select },
}));
vi.mock("../../resource-access", () => ({
  listAccessibleResourceIds: mocks.listAccessibleResourceIds,
}));
vi.mock("./list-projects", () => ({ default: mocks.listProjects }));

import listProjectSidebar from "./list-project-sidebar";

const createdAt = new Date("2026-08-31T12:00:00.000Z");

describe("listProjectSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters inaccessible resources while retaining empty projects and loading each resource type in one batch", async () => {
    mocks.listProjects.mockResolvedValue([
      {
        id: "project-one",
        name: "One",
        leadTeamId: "team-one",
        leadTeamName: "Team One",
      },
      {
        id: "project-empty",
        name: "Empty",
        leadTeamId: null,
        leadTeamName: null,
      },
    ]);

    const boardLinks = [
      {
        id: "link-board-visible",
        projectId: "project-one",
        boardId: "board-visible",
        organizationId: "org-one",
        relationship: "deliverable",
        label: null,
        note: null,
        rank: 2,
        createdBy: "user-one",
        createdAt,
      },
      {
        id: "link-board-hidden",
        projectId: "project-one",
        boardId: "board-hidden",
        organizationId: "org-one",
        relationship: "context",
        label: null,
        note: null,
        rank: 1,
        createdBy: "user-one",
        createdAt,
      },
    ];
    const repoLinks = [
      {
        id: "link-repo-visible",
        projectId: "project-one",
        repoId: "repo-visible",
        organizationId: "org-one",
        relationship: "dependency",
        label: "Code",
        note: null,
        rank: 1,
        createdBy: "user-one",
        createdAt,
      },
    ];
    const tableLinks = [
      {
        id: "link-table-hidden",
        projectId: "project-one",
        tableId: "table-hidden",
        organizationId: "org-one",
        relationship: "context",
        label: null,
        note: null,
        rank: 3,
        createdBy: "user-one",
        createdAt,
      },
    ];

    let accessibleBoardIds = ["board-visible"];
    const rowsByTable = new Map<unknown, unknown[]>([
      [projectBoardTable, boardLinks],
      [projectRepoTable, repoLinks],
      [projectTableLinkTable, tableLinks],
      [
        boardTable,
        [
          {
            id: "board-visible",
            slug: "visible-board",
            name: "Visible board",
            icon: null,
            archivedAt: null,
            secret: "not projected",
          },
          {
            id: "board-hidden",
            slug: "hidden-board",
            name: "Hidden board",
            icon: null,
            archivedAt: null,
          },
        ],
      ],
      [
        repoTable,
        [
          {
            id: "repo-visible",
            owner: "acme",
            name: "repo",
            provider: "github",
            url: "https://example.test/acme/repo",
            description: null,
            isActive: true,
            config: { token: "secret" },
          },
        ],
      ],
      [dataTableTable, []],
    ]);
    mocks.select.mockImplementation(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn().mockImplementation(async () => {
          if (table === boardTable) {
            return (rowsByTable.get(table) ?? []).filter((row) =>
              accessibleBoardIds.includes((row as { id: string }).id),
            );
          }
          return rowsByTable.get(table) ?? [];
        }),
      })),
    }));
    mocks.listAccessibleResourceIds.mockImplementation(
      async ({ resourceType }: { resourceType: string }) => {
        if (resourceType === "board") return accessibleBoardIds;
        if (resourceType === "repo") return ["repo-visible"];
        return [];
      },
    );

    const result = await listProjectSidebar("org-one", "user-one");

    expect(mocks.listProjects).toHaveBeenCalledOnce();
    expect(mocks.listProjects).toHaveBeenCalledWith(
      "org-one",
      "user-one",
      false,
    );
    expect(mocks.select).toHaveBeenCalledTimes(5);
    expect(mocks.listAccessibleResourceIds).toHaveBeenCalledTimes(3);
    expect(mocks.listAccessibleResourceIds).toHaveBeenCalledWith({
      organizationId: "org-one",
      resourceType: "board",
      userId: "user-one",
      resourceIds: ["board-visible", "board-hidden"],
    });
    expect(mocks.listAccessibleResourceIds).toHaveBeenCalledWith({
      organizationId: "org-one",
      resourceType: "repo",
      userId: "user-one",
      resourceIds: ["repo-visible"],
    });
    expect(mocks.listAccessibleResourceIds).toHaveBeenCalledWith({
      organizationId: "org-one",
      resourceType: "table",
      userId: "user-one",
      resourceIds: ["table-hidden"],
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: "project-one",
        leadTeam: { id: "team-one", name: "Team One" },
        resources: [
          expect.objectContaining({
            resourceType: "repo",
            resourceId: "repo-visible",
            resource: {
              id: "repo-visible",
              owner: "acme",
              name: "repo",
              provider: "github",
              url: "https://example.test/acme/repo",
              description: null,
              isActive: true,
            },
          }),
          expect.objectContaining({
            resourceType: "board",
            resourceId: "board-visible",
            resource: {
              id: "board-visible",
              slug: "visible-board",
              name: "Visible board",
              icon: null,
              archivedAt: null,
            },
          }),
        ],
      }),
      expect.objectContaining({
        id: "project-empty",
        leadTeam: null,
        resources: [],
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("board-hidden");
    expect(JSON.stringify(result)).not.toContain("table-hidden");
    expect(JSON.stringify(result)).not.toContain("secret");

    accessibleBoardIds = ["board-visible", "board-hidden"];
    mocks.select.mockClear();
    const authorizationDisabled = await listProjectSidebar(
      "org-one",
      "user-one",
    );
    expect(
      authorizationDisabled[0]?.resources.map(
        (resource) => resource.resourceId,
      ),
    ).toContain("board-hidden");
  });
});
