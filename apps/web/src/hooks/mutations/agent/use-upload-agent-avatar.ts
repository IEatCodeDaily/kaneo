import { useMutation, useQueryClient } from "@tanstack/react-query";
import uploadAgentAvatar from "@/fetchers/agent/upload-agent-avatar";
import { prepareAvatarImage } from "@/lib/prepare-avatar-image";
import { invalidateAgentMembershipQueries } from "./invalidate-agent-membership-queries";

/**
 * Crop/guard-rail-encode an uploaded image and store it as the agent's
 * avatar. The agent user is non-interactive, so an org admin does this on
 * its behalf from the Agent Manager.
 */
export function useUploadAgentAvatar(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      agentId,
      file,
    }: {
      agentId: string;
      file: File;
    }) => {
      const { contentType, data } = await prepareAvatarImage(file);
      return uploadAgentAvatar({ agentId, contentType, data });
    },
    onSuccess: () =>
      invalidateAgentMembershipQueries(queryClient, organizationId),
  });
}

export default useUploadAgentAvatar;
