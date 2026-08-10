import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug",
)({
  component: RouteComponent,
});

function RouteComponent() {
  return <Outlet />;
}
