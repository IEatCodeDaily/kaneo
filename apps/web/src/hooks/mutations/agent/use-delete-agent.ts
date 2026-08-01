import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteAgent from "@/fetchers/agent/delete-agent";

export function useDeleteAgent(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents", organizationId] });
    },
  });
}

export default useDeleteAgent;
