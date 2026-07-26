import { useMutation } from "@tanstack/react-query";
import deleteBoard from "@/fetchers/board/delete-board";

function useDeleteBoard() {
  return useMutation({
    mutationFn: deleteBoard,
  });
}

export default useDeleteBoard;
