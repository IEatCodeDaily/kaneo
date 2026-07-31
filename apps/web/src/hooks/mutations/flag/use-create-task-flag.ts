import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateTaskFlagRequest } from "@/fetchers/flag/create-task-flag";
import createTaskFlag from "@/fetchers/flag/create-task-flag";

function useCreateTaskFlag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTaskFlag,
    onSuccess: (_created, variables: CreateTaskFlagRequest) => {
      void queryClient.invalidateQueries({
        queryKey: ["task-flags", variables.taskId],
      });
      void queryClient.invalidateQueries({ queryKey: ["my-flags"] });
    },
  });
}

export default useCreateTaskFlag;
