import { useQuery } from "@tanstack/react-query";
import getRepoIssues from "@/fetchers/repo/get-repo-issues";
import type { RepoIssueStateFilter } from "@/types/repo";

function useGetRepoIssues({
  repoId,
  state = "open",
  page = 1,
  limit = 50,
}: {
  repoId: string;
  state?: RepoIssueStateFilter;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryFn: () => getRepoIssues({ repoId, state, page, limit }),
    queryKey: ["repo-issues", repoId, state, page, limit],
    enabled: !!repoId,
  });
}

export default useGetRepoIssues;
