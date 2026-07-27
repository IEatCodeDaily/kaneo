import { useQuery } from "@tanstack/react-query";
import getRepoPullRequests from "@/fetchers/repo/get-repo-pull-requests";
import type { RepoPullRequestStateFilter } from "@/types/repo";

function useGetRepoPullRequests({
  repoId,
  state = "open",
  page = 1,
  limit = 50,
}: {
  repoId: string;
  state?: RepoPullRequestStateFilter;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryFn: () => getRepoPullRequests({ repoId, state, page, limit }),
    queryKey: ["repo-pull-requests", repoId, state, page, limit],
    enabled: !!repoId,
  });
}

export default useGetRepoPullRequests;
