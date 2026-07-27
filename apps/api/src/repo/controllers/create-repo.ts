import db from "../../database";
import { repoTable } from "../../database/schema";

type CreateRepoOptions = {
  organizationId: string;
  provider: "github" | "gitea";
  owner: string;
  name: string;
  url: string;
  externalId?: string;
  description?: string;
  defaultBranch?: string;
  isPrivate?: boolean;
  config?: Record<string, unknown>;
};

async function createRepo(options: CreateRepoOptions) {
  const [createdRepo] = await db
    .insert(repoTable)
    .values({
      organizationId: options.organizationId,
      provider: options.provider,
      owner: options.owner,
      name: options.name,
      url: options.url,
      externalId: options.externalId,
      description: options.description,
      defaultBranch: options.defaultBranch,
      isPrivate: options.isPrivate ?? false,
      config: options.config,
    })
    .returning();

  return createdRepo;
}

export default createRepo;
