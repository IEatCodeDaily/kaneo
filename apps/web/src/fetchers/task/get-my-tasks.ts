import { client } from "@kaneo/libs";

export type MyTasksRelation = "assigned" | "created" | "team" | "all";

export type MyTasksParams = {
  organizationId?: string;
  relation?: MyTasksRelation;
  includeCompleted?: boolean;
};

/**
 * Cross-board list of tasks related to the signed-in user (#58).
 * The API resolves the user from the session, so no user id is sent.
 */
async function getMyTasks({
  organizationId,
  relation = "all",
  includeCompleted = false,
}: MyTasksParams = {}) {
  const response = await client.task["my-tasks"].$get({
    query: {
      ...(organizationId ? { organizationId } : {}),
      relation,
      includeCompleted: includeCompleted ? "true" : "false",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default getMyTasks;
