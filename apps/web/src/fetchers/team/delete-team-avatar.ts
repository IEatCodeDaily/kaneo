import { client } from "@kaneo/libs";

async function deleteTeamAvatar(teamId: string) {
  const response = await client.team[":teamId"].avatar.$delete({
    param: { teamId },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default deleteTeamAvatar;
