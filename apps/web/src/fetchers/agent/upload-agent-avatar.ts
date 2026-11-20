import { getApiUrl } from "@/fetchers/get-api-url";

async function uploadAgentAvatar({
  agentId,
  contentType,
  data,
}: {
  agentId: string;
  contentType: string;
  data: string;
}) {
  const response = await fetch(getApiUrl(`/agent/${agentId}/avatar`), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ contentType, data }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{ url: string; size: number }>;
}

export default uploadAgentAvatar;
