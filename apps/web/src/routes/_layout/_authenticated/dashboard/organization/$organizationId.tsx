import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationId",
)({
  component: RouteComponent,
});

function RouteComponent() {
  return <Outlet />;
}
