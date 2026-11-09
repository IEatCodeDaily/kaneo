import { getApiUrl } from "@/fetchers/get-api-url";

/** An agent identity; its token is separate and can be reissued. */
export type Agent = {
  id: string;
  name: string;
  createdAt: string;
  token: { id: string; start: string | null; createdAt: string } | null;
};

export default async function getAgents(organizationId: string) {
  const response = await fetch(
    getApiUrl(`/agent?organizationId=${encodeURIComponent(organizationId)}`),
    { credentials: "include" },
  );
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as Agent[];
}
