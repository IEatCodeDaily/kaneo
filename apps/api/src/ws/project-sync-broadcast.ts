import { eq } from "drizzle-orm";
import db from "../database";
import { organizationMemberTable } from "../database/schema";
import { subscribeToEvent } from "../events";
import { broadcastToUser } from "./index";

/**
 * Fan project.created/updated/archived/unarchived out to every member of the
 * project's organization.
 *
 * Projects are org-scoped like Repos, not board-scoped like Task events, so
 * the user socket is the only channel that can carry a Projects list/detail
 * refresh. Kaneo disables refetch-on-focus, so without this push the
 * Projects overview and sidebar would never learn about a change made by
 * another tab or another user. Clients react by invalidating their
 * project-* query caches (see the web app's use-user-websocket +
 * invalidateProjectQueries).
 */
type ProjectSyncEvent = { organizationId: string; projectId: string };

async function broadcastProjectSync(
  messageType: string,
  { organizationId, projectId }: ProjectSyncEvent,
) {
  if (!organizationId || !projectId) return;

  const members = await db
    .select({ userId: organizationMemberTable.userId })
    .from(organizationMemberTable)
    .where(eq(organizationMemberTable.organizationId, organizationId));

  for (const { userId } of members) {
    broadcastToUser(userId, { type: messageType, projectId });
  }
}

export async function registerProjectSyncBroadcast(): Promise<void> {
  await subscribeToEvent<ProjectSyncEvent>("project.created", (data) =>
    broadcastProjectSync("PROJECT_CREATED", data),
  );
  await subscribeToEvent<ProjectSyncEvent>("project.updated", (data) =>
    broadcastProjectSync("PROJECT_UPDATED", data),
  );
  await subscribeToEvent<ProjectSyncEvent>("project.archived", (data) =>
    broadcastProjectSync("PROJECT_ARCHIVED", data),
  );
  await subscribeToEvent<ProjectSyncEvent>("project.unarchived", (data) =>
    broadcastProjectSync("PROJECT_UNARCHIVED", data),
  );
}
