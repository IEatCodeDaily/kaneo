import { useQuery } from "@tanstack/react-query";
import getRepo from "@/fetchers/repo/get-repo";

function useGetRepo({ id }: { id: string }) {
  return useQuery({
    queryFn: () => getRepo(id),
    queryKey: ["repo", id],
    enabled: !!id,
  });
}

export default useGetRepo;
