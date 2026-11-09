import { describe, expect, it } from "vitest";
import { createApp } from "../../apps/api/src/index";

describe("API integration: config", () => {
  it("returns the public config shape", async () => {
    const { app } = createApp();

    const response = await app.request("/api/config");

    expect(response.status).toBe(200);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toMatchObject({
      disableRegistration: false,
      disablePasswordRegistration: false,
      disableEmailOtpSignIn: false,
      disableLoginForm: false,
      customOAuthAutoLogin: false,
      isDemoMode: false,
      hasGuestAccess: true,
    });
    expect(payload).toSatisfy((value: Record<string, unknown>) =>
      [
        "hasSmtp",
        "hasGithubSignIn",
        "hasGoogleSignIn",
        "hasDiscordSignIn",
        "hasCustomOAuth",
      ].every((key) => typeof value[key] === "boolean"),
    );
    // Teams capability flags are booleans only: no ids or secrets leak.
    expect(payload.teams).toEqual({
      tab: expect.any(Boolean),
      linkPreviews: expect.any(Boolean),
      openInTeams: expect.any(Boolean),
    });
  });
});
