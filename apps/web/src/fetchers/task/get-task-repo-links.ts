import { getApiUrl } from "@/fetchers/get-api-url";

export type TaskRepoLink = {
  id: string;
  itemType: "issues" | "pull-requests";
  repoId: string;
  number: number;
  title: string;
  state: string;
  url: string;
  createdAt: string;
};

async function getTaskRepoLinks(taskId: string) {
  if (!taskId) return [];

  const response = await fetch(getApiUrl(`/task/${taskId}/repo-links`), {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error((await response.text()) || "Could not load linked items.");
  }

  return (await response.json()) as TaskRepoLink[];
}

export default getTaskRepoLinks;
