import { client } from "@kaneo/libs";

async function uploadOrganizationAvatar({
  organizationId,
  contentType,
  data,
}: {
  organizationId: string;
  contentType: string;
  data: string;
}) {
  const response = await client.organization[":organizationId"].avatar.$put({
    param: { organizationId },
    json: { contentType, data },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default uploadOrganizationAvatar;
