import { createFileRoute, redirect } from "@tanstack/react-router";

// Connections is now Integrations (GitHub + Microsoft Teams). Keep old links.
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/organization/connections",
)({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/settings/organization/integrations" });
  },
});
