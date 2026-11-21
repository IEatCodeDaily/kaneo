import { client } from "@kaneo/libs";

async function deleteOrganizationAvatar(organizationId: string) {
  const response = await client.organization[":organizationId"].avatar.$delete({
    param: { organizationId },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default deleteOrganizationAvatar;
