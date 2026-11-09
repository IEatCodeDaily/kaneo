import { getApiUrl } from "@/fetchers/get-api-url";
import type { CreatedAgent } from "./create-agent";

/** New token for an existing agent; the previous token stops working. */
export default async function reissueAgentToken(agentId: string) {
  const response = await fetch(getApiUrl(`/agent/${agentId}/token`), {
    method: "POST",
    credentials: "include",
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.message ?? "Could not reissue token");
  }
  return body as CreatedAgent;
}
