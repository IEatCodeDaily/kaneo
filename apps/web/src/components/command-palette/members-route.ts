export function getOrganizationMembersRoute(organizationSlug: string) {
  return {
    to: "/dashboard/organization/$organizationSlug/members" as const,
    params: { organizationSlug },
  };
}
