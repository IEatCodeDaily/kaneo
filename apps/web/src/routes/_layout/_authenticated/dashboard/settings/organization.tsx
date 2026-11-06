import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/organization",
)({ component: OrganizationSettings });

function OrganizationSettings() {
  return <Outlet />;
}
