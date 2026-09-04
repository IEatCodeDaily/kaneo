import { client } from "@kaneo/libs";

export default async function getProjectSidebar(organizationId: string) {
  const response = await client.project.sidebar.$get({
    query: { organizationId },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
