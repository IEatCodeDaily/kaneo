import { useLocation } from "@tanstack/react-router";

/**
 * Central sidebar active-state derivation (#sidebar-active-redesign).
 *
 * Every nav section declares its items against these route patterns instead of
 * hand-rolling pathname string surgery or guessing param names. Patterns use
 * TanStack Router's `$param` segment syntax and mirror the routeTree 1:1, so
 * "matches the pattern with these params bound" is equivalent to "the router's
 * matched chain contains this route with these params" — without needing a
 * router context (the sidebar renders in component tests with partial router
 * mocks, where useMatches() is unavailable).
 */
export const SIDEBAR_ROUTES = {
  /** The organization index — the boards overview grid. */
  orgIndex: "/dashboard/organization/$organizationSlug",
  home: "/dashboard/organization/$organizationSlug/home",
  inbox: "/dashboard/organization/$organizationSlug/inbox",
  myTasks: "/dashboard/organization/$organizationSlug/my-tasks",
  /** Section bases (prefix-matched, cover every child route). */
  boards: "/dashboard/organization/$organizationSlug/board",
  board: "/dashboard/organization/$organizationSlug/board/$boardSlug",
  repos: "/dashboard/organization/$organizationSlug/repo",
  repo: "/dashboard/organization/$organizationSlug/repo/$repoId",
  tables: "/dashboard/organization/$organizationSlug/table",
  table: "/dashboard/organization/$organizationSlug/table/$tableId",
  dashboards: "/dashboard/organization/$organizationSlug/dashboards",
  dashboard:
    "/dashboard/organization/$organizationSlug/dashboards/$dashboardId",
  projects: "/dashboard/organization/$organizationSlug/projects",
  project: "/dashboard/organization/$organizationSlug/projects/$projectSlug",
} as const;

/**
 * The one selected treatment for every active sidebar entry at every depth
 * (established on nav-main by #96/#102, now shared): a solid primary pill so
 * count badges stay visible on both theme modes (#102's amber badge contract).
 */
export const SIDEBAR_ACTIVE_PILL =
  "data-[active=true]:bg-primary data-[active=true]:font-semibold data-[active=true]:text-primary-foreground";

export type SidebarPatternOptions = {
  /** Match the whole pathname, not just the prefix (child routes excluded). */
  exact?: boolean;
};

/**
 * Match a route pattern against a pathname segment by segment. `$param`
 * segments bind whatever the pathname carries; literal segments must be equal.
 * Prefix semantics by default (child routes keep the parent active), exact
 * when requested. Returns the bound params, or null when the pattern does not
 * match. Fails closed: a param expectation that the pattern did not bind never
 * matches.
 */
export function matchSidebarPattern(
  pattern: string,
  pathname: string,
  options: SidebarPatternOptions = {},
): Record<string, string> | null {
  const patternSegments = pattern.split("/").filter(Boolean);
  const pathSegments = pathname.split("/").filter(Boolean);
  if (options.exact) {
    if (patternSegments.length !== pathSegments.length) return null;
  } else if (pathSegments.length < patternSegments.length) {
    return null;
  }
  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegments.length; i += 1) {
    const segment = patternSegments[i];
    const actual = pathSegments[i];
    if (segment.startsWith("$")) {
      params[segment.slice(1)] = actual;
    } else if (segment !== actual) {
      return null;
    }
  }
  return params;
}

/**
 * Whether `pathname` sits on `pattern` (prefix by default) with every expected
 * param bound to its expected value.
 */
export function sidebarEntryIsActive(
  pattern: string,
  pathname: string,
  expected?: Record<string, string>,
  options: SidebarPatternOptions = {},
): boolean {
  const params = matchSidebarPattern(pattern, pathname, options);
  if (!params) return false;
  if (!expected) return true;
  return Object.entries(expected).every(
    ([name, value]) => params[name] === value,
  );
}

/**
 * One hook for every nav component: derive the active item/section from the
 * declared route patterns instead of per-file pathname surgery.
 */
export function useSidebarActive() {
  const { pathname } = useLocation();
  return {
    pathname,
    isActive: (
      pattern: string,
      expected?: Record<string, string>,
      options?: SidebarPatternOptions,
    ) => sidebarEntryIsActive(pattern, pathname, expected, options),
  };
}
