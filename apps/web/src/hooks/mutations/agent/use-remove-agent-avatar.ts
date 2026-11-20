import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteAgentAvatar from "@/fetchers/agent/delete-agent-avatar";
import { invalidateAgentMembershipQueries } from "./invalidate-agent-membership-queries";

export function useRemoveAgentAvatar(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => deleteAgentAvatar(agentId),
    onSuccess: () =>
      invalidateAgentMembershipQueries(queryClient, organizationId),
  });
}

export default useRemoveAgentAvatar;
