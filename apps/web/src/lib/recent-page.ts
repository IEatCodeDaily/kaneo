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

export type RecentKind = "board" | "repo" | "project" | "ticket";

type ResolvedRecentPage = {
  pathname: string;
  label: string;
  kind: RecentKind;
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

  const kind =
    resourceType === "board"
      ? "board"
      : resourceType === "repo"
        ? "repo"
        : resourceType === "projects"
          ? "project"
          : null;
  if (!kind) return null;
  // The template literal needs the explicit key annotation: without it the
  // index into RecentResources widens to string and the find param goes any.
  const resourceKey: keyof RecentResources =
    kind === "project" ? "projects" : `${kind}s`;
  const collection = resources[resourceKey];
  const resource = collection.find(
    (item) => item.id === routeIdentity || item.slug === routeIdentity,
  );
  if (!resource) return null;

  segments[organizationIndex + 1] = organization.slug;
  if (resource.slug) segments[organizationIndex + 3] = resource.slug;
  return { pathname: `/${segments.join("/")}`, label: resource.name, kind };
}

export function recentRelativeTime(openedAt?: number) {
  if (!openedAt) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - openedAt) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
