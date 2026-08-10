import { useParams } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";

function useActiveOrganization() {
  const {
    data: activeOrganization,
    error,
    refetch: refetchActiveOrganization,
  } = authClient.useActiveOrganization();
  const {
    data: organizations,
    isPending: isOrganizationsPending,
    refetch: refetchOrganizations,
  } = authClient.useListOrganizations();
  const { organizationSlug, organizationId: legacyOrganizationId } = useParams({
    strict: false,
    select: (params) => ({
      organizationSlug:
        "organizationSlug" in params &&
        typeof params.organizationSlug === "string"
          ? params.organizationSlug
          : undefined,
      organizationId:
        "organizationId" in params &&
        typeof params.organizationId === "string"
          ? params.organizationId
          : undefined,
    }),
  });

  // Resolve org from URL: prefer slug, fall back to legacy UUID for compat
  const organizationFromRoute = organizationSlug
    ? organizations?.find(
        (organization) =>
          organization.slug.toLowerCase() ===
          organizationSlug.toLowerCase(),
      )
    : legacyOrganizationId
      ? organizations?.find(
          (organization) => organization.id === legacyOrganizationId,
        )
      : undefined;
  const organization =
    organizationFromRoute ?? activeOrganization ?? organizations?.[0];
  const isLoading =
    ((!!organizationSlug || !!legacyOrganizationId) &&
      isOrganizationsPending &&
      !organizationFromRoute) ||
    (!organization && !error);

  return {
    data: organization,
    error,
    isLoading,
    isError: !!error,
    refetch: async () => {
      await Promise.all([refetchActiveOrganization(), refetchOrganizations()]);
    },
  };
}

export default useActiveOrganization;
