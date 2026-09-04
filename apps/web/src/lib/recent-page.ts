type OrganizationIdentity = {
  id: string;
  slug: string;
};

type NamedResource = {
  id: string;
  name: string;
  slug?: string | null;
};

type RecentResources = {
  boards: NamedResource[];
  repos: NamedResource[];
  projects: NamedResource[];
};

type ResolvedRecentPage = {
  pathname: string;
  label: string;
};

export function resolveRecentPage(
  pathname: string,
  organization: OrganizationIdentity,
  resources: RecentResources,
): ResolvedRecentPage | null {
  const segments = pathname.split("/").filter(Boolean);
  const organizationIndex = segments.indexOf("organization");
  if (organizationIndex < 0) return null;
  const resourceType = segments[organizationIndex + 2];
  const routeIdentity = segments[organizationIndex + 3];
  if (!routeIdentity) return null;

  const collection =
    resourceType === "board"
      ? resources.boards
      : resourceType === "repo"
        ? resources.repos
        : resourceType === "projects"
          ? resources.projects
          : null;
  if (!collection) return null;
  const resource = collection.find(
    (item) => item.id === routeIdentity || item.slug === routeIdentity,
  );
  if (!resource) return null;

  segments[organizationIndex + 1] = organization.slug;
  if (resource.slug) segments[organizationIndex + 3] = resource.slug;
  return { pathname: `/${segments.join("/")}`, label: resource.name };
}
