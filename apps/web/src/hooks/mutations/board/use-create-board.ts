import { useMutation } from "@tanstack/react-query";
import createBoard from "@/fetchers/board/create-board";

function useCreateBoard({
  name,
  slug,
  organizationId,
  icon,
}: {
  name: string;
  slug: string;
  organizationId: string;
  icon: string;
}) {
  return useMutation({
    mutationFn: () => createBoard({ name, slug, organizationId, icon }),
  });
}

export default useCreateBoard;
