import { useParams } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";

function useActiveOrganization() {
  const { data: activeOrganization, error } =
    authClient.useActiveOrganization();
  const { data: organizations, isPending: isOrganizationsPending } =
    authClient.useListOrganizations();
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
  const organization = organizationFromRoute ?? activeOrganization;
  const isLoading =
    (!!organizationId && isOrganizationsPending && !organizationFromRoute) ||
    (!organization && !error);

  return {
    data: organization,
    error,
    isLoading,
    isError: !!error,
  };
}

export default useActiveOrganization;
