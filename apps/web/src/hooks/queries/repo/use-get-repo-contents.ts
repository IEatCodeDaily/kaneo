import { useQuery } from "@tanstack/react-query";
import getRepoContents from "@/fetchers/repo/get-repo-contents";

export default function useGetRepoContents({
  repoId,
  path = "",
  ref,
}: {
  repoId: string;
  path?: string;
  ref?: string;
}) {
  return useQuery({
    queryFn: () => getRepoContents({ repoId, path, ref }),
    queryKey: ["repo-contents", repoId, path, ref],
    enabled: !!repoId,
    staleTime: 60_000,
  });
}
