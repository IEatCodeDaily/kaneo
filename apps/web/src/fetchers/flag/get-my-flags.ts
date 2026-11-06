import { client } from "@kaneo/libs";

async function getMyFlags(organizationId?: string) {
  const response = await client.flag.mine.$get({
    query: { organizationId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const flags = await response.json();
  return flags.map(
    (flag): typeof flag & { resolvedAt?: string | null } => flag,
  );
}

export default getMyFlags;
