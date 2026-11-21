import type { QueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

/**
 * Refresh every surface that renders `organization.logo`.
 *
 * Better Auth's React hooks (`useListOrganizations`, `useActiveOrganization`)
 * are nanostore-backed, not React Query — the react-query keys below match no
 * live query. The org avatar routes are called through the raw @kaneo/libs
 * fetcher, so they bypass `authClient`'s proxy and fire no atom signal; the
 * org rows (data-URL logo included) stay stale in every mounted hook until a
 * page refresh. Flip the two signals the hooks listen on, then drop the
 * legacy react-query keys for any future react-query consumers.
 */
export default async function invalidateOrganizationQueries(
  queryClient: QueryClient,
) {
  authClient.$store.notify("$listOrg");
  authClient.$store.notify("$activeOrgSignal");
  await queryClient.invalidateQueries({ queryKey: ["organizations"] });
  await queryClient.invalidateQueries({
    queryKey: ["active-organization"],
  });
}
