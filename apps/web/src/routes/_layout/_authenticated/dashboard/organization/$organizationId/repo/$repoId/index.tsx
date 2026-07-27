import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationId/repo/$repoId/",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/organization/$organizationId/repo/$repoId/issues",
      params,
      replace: true,
    });
  },
});
