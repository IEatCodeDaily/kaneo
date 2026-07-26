import { useMutation } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { createSlug } from "@/lib/utils/create-slug";

type UpdateOrganizationRequest = {
  organizationId: string;
  name?: string;
  description?: string;
  slug?: string;
  logo?: string;
  metadata?: Record<string, unknown>;
};

function useUpdateOrganization() {
  return useMutation({
    mutationFn: async ({
      organizationId,
      name,
      description,
      slug,
      logo,
      metadata,
    }: UpdateOrganizationRequest) => {
      const updateData: {
        name?: string;
        description?: string;
        slug?: string;
        logo?: string;
        metadata?: Record<string, unknown>;
      } = {};

      if (name !== undefined) {
        updateData.name = name;
        if (slug === undefined) {
          updateData.slug = createSlug(name);
        }
      }

      if (slug !== undefined) {
        updateData.slug = slug;
      }

      if (description !== undefined) {
        updateData.description = description;
      }

      if (logo !== undefined) {
        updateData.logo = logo;
      }

      if (metadata !== undefined) {
        updateData.metadata = metadata;
      }

      const { data, error } = await authClient.organization.update({
        data: updateData,
        organizationId: organizationId,
      });

      if (error) {
        throw new Error(error.message || "Failed to update organization");
      }

      return data;
    },
  });
}

export default useUpdateOrganization;
