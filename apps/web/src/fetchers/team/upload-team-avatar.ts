import { client } from "@kaneo/libs";

async function uploadTeamAvatar({
  teamId,
  contentType,
  data,
}: {
  teamId: string;
  contentType: string;
  data: string;
}) {
  const response = await client.team[":teamId"].avatar.$put({
    param: { teamId },
    json: { contentType, data },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default uploadTeamAvatar;
