import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { repoIssueTable } from "../../database/schema";

export async function getRepoIssue(repoId: string, number: number) {
  const issue = await db.query.repoIssueTable.findFirst({
    where: and(eq(repoIssueTable.repoId, repoId), eq(repoIssueTable.number, number)),
  });
  if (!issue) throw new HTTPException(404, { message: "Issue not found" });
  return issue;
}
