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
  const { organizationId } = useParams({
    strict: false,
    select: (params) => ({
      organizationId:
        "organizationId" in params && typeof params.organizationId === "string"
          ? params.organizationId
          : undefined,
    }),
  });

  const organizationFromRoute = organizationId
    ? organizations?.find((organization) => organization.id === organizationId)
    : undefined;
  const organization =
    organizationFromRoute ?? activeOrganization ?? organizations?.[0];
  const isLoading =
    (!!organizationId && isOrganizationsPending && !organizationFromRoute) ||
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
