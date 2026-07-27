import { useQuery } from "@tanstack/react-query";
import getRepoIssue from "@/fetchers/repo/get-repo-issue";

function useGetRepoIssue({
  repoId,
  number,
}: {
  repoId: string;
  number: number;
}) {
  return useQuery({
    queryFn: () => getRepoIssue(repoId, number),
    queryKey: ["repo-issue", repoId, number],
    enabled: !!repoId && Number.isFinite(number),
  });
}

export default useGetRepoIssue;
