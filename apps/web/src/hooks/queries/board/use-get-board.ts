import { useQuery } from "@tanstack/react-query";
import getBoard from "@/fetchers/board/get-board";

function useGetBoard({
  id,
  organizationId,
}: {
  id: string;
  organizationId: string;
}) {
  return useQuery({
    queryFn: () => getBoard({ id, organizationId }),
    queryKey: ["boards", organizationId, id],
    enabled: !!id,
  });
}

export default useGetBoard;
