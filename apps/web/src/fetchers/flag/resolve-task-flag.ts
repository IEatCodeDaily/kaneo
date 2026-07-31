import { client } from "@kaneo/libs";

export type ResolveTaskFlagRequest = {
  flagId: string;
  taskId?: string;
};

/**
 * Unflagging is a POST (not a PUT) and keeps the row so history records who
 * resolved it and when.
 */
async function resolveTaskFlag({ flagId }: ResolveTaskFlagRequest) {
  const response = await client.flag[":id"].resolve.$post({
    param: { id: flagId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return await response.json();
}

export default resolveTaskFlag;
