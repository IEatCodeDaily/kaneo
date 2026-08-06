import { createFileRoute, redirect } from "@tanstack/react-router";

// GitHub account delegation moved into the unified Connections page, which
// shows the account grant and the organization App installations together.
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/account/github",
)({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/settings/account/connections" });
  },
});
