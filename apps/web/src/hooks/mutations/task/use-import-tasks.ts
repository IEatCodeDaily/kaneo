import { useMutation } from "@tanstack/react-query";
import importTasks, { type TaskToImport } from "@/fetchers/task/import-tasks";

const useImportTasks = () => {
  return useMutation({
    mutationFn: ({
      boardId,
      tasks,
    }: {
      boardId: string;
      tasks: TaskToImport[];
    }) => importTasks(boardId, tasks),
  });
};

export default useImportTasks;
