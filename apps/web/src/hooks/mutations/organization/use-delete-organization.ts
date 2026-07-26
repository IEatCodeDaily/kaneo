import { useMutation } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

type DeleteOrganizationRequest = {
  organizationId: string;
};

function useDeleteOrganization() {
  return useMutation({
    mutationFn: async ({ organizationId }: DeleteOrganizationRequest) => {
      const { data, error } = await authClient.organization.delete({
        organizationId: organizationId,
      });

      if (error) {
        throw new Error(error.message || "Failed to delete organization");
      }

      return data;
    },
  });
}

export default useDeleteOrganization;
