import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { inTeamsHost } from "@/lib/teams-host";

export const Route = createFileRoute("/auth")({
  beforeLoad: async () => {
    let session = null;
    try {
      const { data } = await authClient.getSession();
      session = data;
    } catch {
      // getSession() rejected — treat as unauthenticated, allow auth pages to render
    }
    if (session) {
      throw redirect({
        to: "/dashboard",
      });
    }
    // Inside Teams the IdP refuses to be framed; sign in via Teams SSO.
    if (inTeamsHost()) {
      throw redirect({ to: "/teams" });
    }
    return { session };
  },
});
