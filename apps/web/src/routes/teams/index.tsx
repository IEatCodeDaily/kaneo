import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/components/auth/layout";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { inTeamsHost } from "@/lib/teams-host";

export const Route = createFileRoute("/teams/")({
  component: TeamsTab,
});

type TeamsSignIn = "pending" | "button" | "no-account" | "blocked" | "failed";

/**
 * Microsoft Teams tab entry point (manifest contentUrl). Signs the user in
 * with Teams SSO: Teams hands us an Entra token for our own app registration
 * (no other app can get one), the API verifies it and sets a partitioned
 * session cookie for the matching existing Kaneo user. No popup, no IdP framing.
 */
function TeamsTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [state, setState] = useState<TeamsSignIn>("pending");

  const signIn = useCallback(async () => {
    setState("pending");
    try {
      const { authentication } = await import("@microsoft/teams-js");
      const token = await authentication.getAuthToken();
      const res = await fetch("/api/auth/teams-sso/sign-in", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.status === 403) return setState("no-account");
      if (!res.ok) return setState("failed");
      // The browser may drop the partitioned cookie (e.g. Safari): confirm it
      // stuck before navigating, else we would loop sign-in -> reload forever.
      const { data } = await authClient
        .getSession({ query: { disableCookieCache: true } })
        .catch(() => ({ data: null }));
      if (!data) return setState("blocked");
      window.location.assign("/dashboard");
    } catch {
      // First use may need consent, which getAuthToken can only show from a
      // user gesture: offer the button.
      setState("button");
    }
  }, []);

  useEffect(() => {
    void (async () => {
      // Not inside a Teams host: this is just the normal app. Teams mobile
      // loads tabs top-level in a WebView (no iframe) with a nativeInterface.
      if (!inTeamsHost()) {
        void navigate({ to: "/dashboard", replace: true });
        return;
      }
      const { app } = await import("@microsoft/teams-js");
      await app.initialize();
      app.notifySuccess();
      const { data } = await authClient
        .getSession()
        .catch(() => ({ data: null }));
      if (data) {
        void navigate({ to: "/dashboard", replace: true });
        return;
      }
      await signIn();
    })().catch(() => setState("failed"));
  }, [navigate, signIn]);

  const message =
    state === "no-account"
      ? t("auth:teams.noAccount")
      : state === "blocked"
        ? t("auth:teams.cookieBlocked")
        : state === "failed"
          ? t("auth:teams.failed")
          : t("auth:teams.subtitle");

  return (
    <AuthLayout title={t("auth:teams.title")} subtitle={message}>
      {state === "blocked" || state === "no-account" ? (
        <Button
          className="w-full"
          onClick={() =>
            window.open(`${window.location.origin}/dashboard`, "_blank")
          }
        >
          {t("auth:teams.openInBrowser")}
        </Button>
      ) : (
        <Button
          className="w-full"
          onClick={signIn}
          disabled={state === "pending"}
        >
          {state === "pending"
            ? t("auth:teams.signingIn")
            : t("auth:teams.signIn")}
        </Button>
      )}
    </AuthLayout>
  );
}
