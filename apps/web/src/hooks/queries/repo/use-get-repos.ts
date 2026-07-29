import { useQuery } from "@tanstack/react-query";
import getRepos from "@/fetchers/repo/get-repos";

function useGetRepos({
  organizationId,
  enabled = true,
}: {
  organizationId: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryFn: () => getRepos(organizationId),
    queryKey: ["repos", organizationId],
    enabled: enabled && !!organizationId,
  });
}

export default useGetRepos;
