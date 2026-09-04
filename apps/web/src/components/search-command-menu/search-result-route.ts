type SearchRouteItem = {
  type: "board" | "repository";
  id: string;
  boardSlug?: string;
  repoId?: string;
};

export function getSearchResultRoute(
  item: SearchRouteItem,
  organizationSlug: string,
) {
  if (item.type === "board" && item.boardSlug) {
    return {
      to: "/dashboard/organization/$organizationSlug/board/$boardSlug/board" as const,
      params: { organizationSlug, boardSlug: item.boardSlug },
    };
  }
  if (item.type === "repository" && item.repoId) {
    return {
      to: "/dashboard/organization/$organizationSlug/repo/$repoId/code" as const,
      params: { organizationSlug, repoId: item.repoId },
      search: { path: "" },
    };
  }
  return null;
}
