import { useQuery } from "@tanstack/react-query";
import getRepos from "@/fetchers/repo/get-repos";

function useGetRepos({ organizationId }: { organizationId: string }) {
  return useQuery({
    queryFn: () => getRepos(organizationId),
    queryKey: ["repos", organizationId],
    enabled: !!organizationId,
  });
}

export default useGetRepos;
