import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { repoPullRequestTable } from "../../database/schema";

export async function getRepoPullRequest(repoId: string, number: number) {
  const pullRequest = await db.query.repoPullRequestTable.findFirst({
    where: and(eq(repoPullRequestTable.repoId, repoId), eq(repoPullRequestTable.number, number)),
  });
  if (!pullRequest) throw new HTTPException(404, { message: "Pull request not found" });
  return pullRequest;
}
