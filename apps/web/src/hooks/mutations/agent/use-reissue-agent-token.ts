import { useMutation, useQueryClient } from "@tanstack/react-query";
import reissueAgentToken from "@/fetchers/agent/reissue-agent-token";

export default function useReissueAgentToken(
  organizationId: string | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reissueAgentToken,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["agents", organizationId] }),
  });
}
