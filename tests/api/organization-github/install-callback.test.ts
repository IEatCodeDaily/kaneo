import { beforeEach, describe, expect, it } from "vitest";
import {
  createInstallState,
  parseInstallState,
} from "../../../apps/api/src/organization-github/install-callback";

describe("GitHub App install state", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret-that-is-at-least-32-characters";
  });

  it("binds an installation callback to one Kaneo organization and user", () => {
    const issuedAt = 1_000_000;
    const state = createInstallState({
      organizationId: "org-1",
      userId: "user-1",
      issuedAt,
    });

    expect(parseInstallState(state, issuedAt + 1_000)).toEqual({
      organizationId: "org-1",
      userId: "user-1",
      issuedAt,
    });
    expect(() => parseInstallState(`${state}x`, issuedAt + 1_000)).toThrow(
      "Invalid install state",
    );
    expect(() => parseInstallState(state, issuedAt + 6 * 60 * 1_000)).toThrow(
      "Expired install state",
    );
  });
});
