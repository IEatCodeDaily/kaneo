export function getOrganizationMembersRoute(_organizationSlug: string) {
  return { to: "/dashboard/settings/organization/members" as const };
}
