import { useQuery } from "@tanstack/react-query";
import getBoards from "@/fetchers/board/get-boards";

function useGetBoards({ organizationId }: { organizationId: string }) {
  return useQuery({
    queryFn: () => getBoards({ organizationId }),
    queryKey: ["boards", organizationId],
    enabled: !!organizationId,
  });
}

export default useGetBoards;
