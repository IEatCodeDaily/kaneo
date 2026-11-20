import { getApiUrl } from "@/fetchers/get-api-url";

export default async function deleteAgentAvatar(agentId: string) {
  const response = await fetch(getApiUrl(`/agent/${agentId}/avatar`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) throw new Error(await response.text());
}
