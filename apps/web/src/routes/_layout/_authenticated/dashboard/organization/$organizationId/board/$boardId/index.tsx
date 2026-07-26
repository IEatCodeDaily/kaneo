import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationId/board/$boardId/",
)({
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/organization/$organizationId/board/$boardId/board",
      replace: true,
    });
  },
});
