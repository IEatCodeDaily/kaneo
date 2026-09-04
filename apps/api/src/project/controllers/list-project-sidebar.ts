import { and, eq, inArray } from "drizzle-orm";
import db from "../../database";
import {
  boardTable,
  dataTableTable,
  projectBoardTable,
  projectRepoTable,
  projectTableLinkTable,
  repoTable,
} from "../../database/schema";
import { listAccessibleResourceIds } from "../../resource-access";
import {
  boardSafeSummary,
  type ProjectResourceLink,
  type ProjectResourceRelationship,
  repoSafeSummary,
  tableSafeSummary,
} from "../project-resource-projection";
import listProjects from "./list-projects";

export default async function listProjectSidebar(
  organizationId: string,
  userId: string,
) {
  const projects = await listProjects(organizationId, userId, false);
  const projectIds = projects.map((project) => project.id);
  if (projectIds.length === 0) return [];

  const [boardLinks, repoLinks, tableLinks] = await Promise.all([
    db
      .select()
      .from(projectBoardTable)
      .where(
        and(
          eq(projectBoardTable.organizationId, organizationId),
          inArray(projectBoardTable.projectId, projectIds),
        ),
      ),
    db
      .select()
      .from(projectRepoTable)
      .where(
        and(
          eq(projectRepoTable.organizationId, organizationId),
          inArray(projectRepoTable.projectId, projectIds),
        ),
      ),
    db
      .select()
      .from(projectTableLinkTable)
      .where(
        and(
          eq(projectTableLinkTable.organizationId, organizationId),
          inArray(projectTableLinkTable.projectId, projectIds),
        ),
      ),
  ]);
  const [boardIds, repoIds, tableIds] = await Promise.all([
    listAccessibleResourceIds({
      organizationId,
      resourceType: "board",
      userId,
      resourceIds: boardLinks.map((link) => link.boardId),
    }),
    listAccessibleResourceIds({
      organizationId,
      resourceType: "repo",
      userId,
      resourceIds: repoLinks.map((link) => link.repoId),
    }),
    listAccessibleResourceIds({
      organizationId,
      resourceType: "table",
      userId,
      resourceIds: tableLinks.map((link) => link.tableId),
    }),
  ]);
  const [boards, repos, tables] = await Promise.all([
    boardIds.length
      ? db
          .select()
          .from(boardTable)
          .where(
            and(
              eq(boardTable.organizationId, organizationId),
              inArray(boardTable.id, boardIds),
            ),
          )
      : [],
    repoIds.length
      ? db
          .select()
          .from(repoTable)
          .where(
            and(
              eq(repoTable.organizationId, organizationId),
              inArray(repoTable.id, repoIds),
            ),
          )
      : [],
    tableIds.length
      ? db
          .select()
          .from(dataTableTable)
          .where(
            and(
              eq(dataTableTable.organizationId, organizationId),
              inArray(dataTableTable.id, tableIds),
            ),
          )
      : [],
  ]);
  const boardById = new Map(boards.map((item) => [item.id, item]));
  const repoById = new Map(repos.map((item) => [item.id, item]));
  const tableById = new Map(tables.map((item) => [item.id, item]));
  const resources = new Map<string, ProjectResourceLink[]>();
  const add = (projectId: string, resource: ProjectResourceLink) =>
    resources.set(projectId, [...(resources.get(projectId) ?? []), resource]);
  for (const link of boardLinks) {
    const item = boardById.get(link.boardId);
    if (item)
      add(link.projectId, {
        ...link,
        resourceType: "board",
        resourceId: link.boardId,
        relationship: link.relationship as ProjectResourceRelationship,
        resource: boardSafeSummary(item),
      });
  }
  for (const link of repoLinks) {
    const item = repoById.get(link.repoId);
    if (item)
      add(link.projectId, {
        ...link,
        resourceType: "repo",
        resourceId: link.repoId,
        relationship: link.relationship as ProjectResourceRelationship,
        resource: repoSafeSummary(item),
      });
  }
  for (const link of tableLinks) {
    const item = tableById.get(link.tableId);
    if (item)
      add(link.projectId, {
        ...link,
        resourceType: "table",
        resourceId: link.tableId,
        relationship: link.relationship as ProjectResourceRelationship,
        resource: tableSafeSummary(item),
      });
  }
  const compare = (a: ProjectResourceLink, b: ProjectResourceLink) =>
    a.rank - b.rank ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.id.localeCompare(b.id);
  return projects.map((project) => ({
    ...project,
    leadTeam: project.leadTeamId
      ? { id: project.leadTeamId, name: project.leadTeamName ?? "" }
      : null,
    resources: (resources.get(project.id) ?? []).sort(compare),
  }));
}
