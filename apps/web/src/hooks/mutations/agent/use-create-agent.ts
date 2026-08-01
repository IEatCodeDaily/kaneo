import { useMutation, useQueryClient } from "@tanstack/react-query";
import createAgent from "@/fetchers/agent/create-agent";

export function useCreateAgent(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents", organizationId] });
    },
  });
}

export default useCreateAgent;
