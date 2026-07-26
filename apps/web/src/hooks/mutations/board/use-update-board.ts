import { useMutation } from "@tanstack/react-query";
import updateBoard from "@/fetchers/board/update-board";

function useUpdateBoard() {
  return useMutation({
    mutationFn: updateBoard,
  });
}

export default useUpdateBoard;
